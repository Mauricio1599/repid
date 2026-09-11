import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  Contract,
  MockNetworkProvider,
  TransactionBuilder,
  SignatureTemplate,
} from 'cashscript';
import {
  generatePrivateKey, secp256k1, hash160, lockingBytecodeToCashAddress, binToHex, utf8ToBin,
} from '@bitauth/libauth';
import identityArtifact from '../contracts/identity_genesis.json' with { type: 'json' };
import receiptArtifact from '../contracts/receipt_genesis.json' with { type: 'json' };
import { indexRawTransaction, createMemoryStore, createJsonFileStore, REPID_RATING_TAG } from '../indexer/repid-indexer.mjs';

// --- Helpers -------------------------------------------------------------

const provider = new MockNetworkProvider();

let seedCounter = 0;
function makeParty() {
  seedCounter += 1;
  const privateKey = generatePrivateKey(() => new Uint8Array(32).fill(seedCounter));
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const pkh = hash160(publicKey);
  const p2pkhBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
  const addressResult = lockingBytecodeToCashAddress({
    bytecode: p2pkhBytecode, prefix: 'bchtest', tokenSupport: true,
  });
  if (typeof addressResult === 'string') throw new Error(addressResult);
  return { privateKey, publicKey, pkh, address: addressResult.address };
}

// Construye el output OP_RETURN de un ISSUED_RATING: OP_RETURN <tag> <score>
function ratingOpReturnOutput(score) {
  const tagBytes = utf8ToBin(REPID_RATING_TAG);
  const scoreBytes = new Uint8Array([score]);
  const bytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, scoreBytes.length, ...scoreBytes,
  ]);
  return { to: bytecode, amount: 0n };
}

// Da de alta una interacción completa (Identity x2 se omite: el MVP de
// ISSUED_RATING solo depende del Receipt) y devuelve las Rating Rights
// listas para ser gastadas.
async function genesisReceipt() {
  const partyA = makeParty();
  const partyB = makeParty();
  const contract = new Contract(receiptArtifact, [partyA.pkh, partyB.pkh], { provider });
  const utxo = { txid: 'aa'.repeat(32), vout: 0, satoshis: 10_000n };
  provider.addUtxo(contract.address, utxo);
  const category = utxo.txid;

  const tx = await new TransactionBuilder({ provider })
    .addInput(
      utxo,
      contract.unlock.mint(
        partyA.publicKey,
        new SignatureTemplate(partyA.privateKey),
        partyB.publicKey,
        new SignatureTemplate(partyB.privateKey),
      ),
    )
    .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } })
    .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } })
.addOutput({ to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } })
    .addOutput({ to: partyA.address, amount: 6000n })
    .send();

  return { partyA, partyB, tx };
}

// Aporta a `owner` una segunda UTXO de fondos normales (sin token) para
// cubrir la comisión de la transacción de ISSUED_RATING.
function fundFeeUtxo(owner, satoshis = 50_000n) {
  const utxo = { txid: 'cc'.repeat(32), vout: 0, satoshis };
  provider.addUtxo(owner.address, utxo);
  return utxo;
}

beforeEach(() => {
  provider.reset();
  seedCounter = 0;
});

// --- Tests: ISSUED_RATING (gasto plano P2PKH) -----------------------------

describe('ISSUED_RATING', () => {
  it('gasta la Rating Right con un OP_RETURN de puntaje y quema el NFT (sin re-emitirlo)', async () => {
    const { partyA, partyB, tx: receiptTx } = await genesisReceipt();

    // La Rating Right de partyA queda en el output 1 de la tx de genesis.
    const ratingRightUtxo = {
      txid: receiptTx.txid,
      vout: 1,
      satoshis: 1000n,
      token: { category: receiptTx.txid, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } },
    };
    provider.addUtxo(partyA.address, ratingRightUtxo);
    const feeUtxo = fundFeeUtxo(partyA);

    const tx = await new TransactionBuilder({ provider })
      .addInput(ratingRightUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
      .addInput(feeUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
      .addOutput(ratingOpReturnOutput(5))
      .addOutput({ to: partyA.address, amount: 40_000n }) // vuelto, sin token: quema implícita
      .send();

    expect(tx.txid).toBeTruthy();
    // El NFT no aparece en ningún output => quemado implícitamente.
    expect(tx.outputs.every((o) => !o.token)).toBe(true);
  });
});

// --- Tests: indexer (RFC-006) ---------------------------------------------

describe('Indexer RFC-006', () => {
  it('reconoce un IDENTITY_GENESIS y extrae categoría + owner', async () => {
    const owner = makeParty();
    const contract = new Contract(identityArtifact, [owner.pkh], { provider });
    const utxo = { txid: 'dd'.repeat(32), vout: 0, satoshis: 10_000n };
    provider.addUtxo(contract.address, utxo);

    const tx = await new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    const store = createMemoryStore();
    const fact = indexRawTransaction(tx.hex, store);

    expect(fact.type).toBe('IDENTITY_GENESIS');
    expect(fact.ownerPkh).toBe(binToHex(owner.pkh));
    expect(fact.identityCategory).toBe(binToHex(hexToBinDisplay(utxo.txid)));
  });

  it('reconoce un IDENTITY_GENESIS acompañado del output de cambio (red real)', async () => {
    const owner = makeParty();
    const contract = new Contract(identityArtifact, [owner.pkh], { provider });
    const utxo = { txid: 'dd'.repeat(32), vout: 0, satoshis: 10_000n };
    provider.addUtxo(contract.address, utxo);

    const tx = await new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    const fact = indexRawTransaction(tx.hex, createMemoryStore());
    expect(fact.type).toBe('IDENTITY_GENESIS');
    expect(fact.ownerPkh).toBe(binToHex(owner.pkh));
  });

  it('reconoce un RECEIPT_GENESIS y registra las dos Rating Rights para seguimiento', async () => {
    const { partyA, partyB, tx } = await genesisReceipt();

    const store = createMemoryStore();
    const fact = indexRawTransaction(tx.hex, store);

    expect(fact.type).toBe('RECEIPT_GENESIS');
    expect(fact.ratingRights).toHaveLength(2);
    expect(fact.ratingRights[0]).toMatchObject({ ownerPkh: binToHex(partyA.pkh), ratesPkh: binToHex(partyB.pkh) });
    expect(fact.ratingRights[1]).toMatchObject({ ownerPkh: binToHex(partyB.pkh), ratesPkh: binToHex(partyA.pkh) });

    // Las Rating Rights quedan rastreadas por outpoint para cuando se gasten.
    expect(store.getRatingRight(fact.ratingRights[0].outpoint)).toBeTruthy();
  });

  it('reconoce un RECEIPT_GENESIS acompañado del output de cambio (red real)', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = new Contract(receiptArtifact, [partyA.pkh, partyB.pkh], { provider });
    const utxo = { txid: 'aa'.repeat(32), vout: 0, satoshis: 10_000n };
    provider.addUtxo(contract.address, utxo);
    const category = utxo.txid;

    const tx = await new TransactionBuilder({ provider })
      .addInput(
        utxo,
        contract.unlock.mint(
          partyA.publicKey,
          new SignatureTemplate(partyA.privateKey),
          partyB.publicKey,
          new SignatureTemplate(partyB.privateKey),
        ),
      )
      .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } })
      .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } })
      .addOutput({ to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } })
      .addOutput({ to: partyA.address, amount: 6000n })
      .send();

    const store = createMemoryStore();
    const fact = indexRawTransaction(tx.hex, store);

    expect(fact.type).toBe('RECEIPT_GENESIS');
    expect(fact.ratingRights).toHaveLength(2);
    expect(fact.ratingRights[0]).toMatchObject({ ownerPkh: binToHex(partyA.pkh), ratesPkh: binToHex(partyB.pkh) });
    expect(store.getRatingRight(fact.ratingRights[0].outpoint)).toBeTruthy();
  });

  it('reconoce un RATING_ISSUED cruzando el ISSUED_RATING con la Rating Right ya indexada', async () => {
    const { partyA, partyB, tx: receiptTx } = await genesisReceipt();

    const store = createMemoryStore();
    indexRawTransaction(receiptTx.hex, store); // indexa el genesis primero, como haría un indexer real

    const ratingRightUtxo = {
      txid: receiptTx.txid,
      vout: 1,
      satoshis: 1000n,
      token: { category: receiptTx.txid, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } },
    };
    provider.addUtxo(partyA.address, ratingRightUtxo);
    const feeUtxo = fundFeeUtxo(partyA);

    const ratingTx = await new TransactionBuilder({ provider })
      .addInput(ratingRightUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
      .addInput(feeUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
      .addOutput(ratingOpReturnOutput(4))
      .addOutput({ to: partyA.address, amount: 40_000n })
      .send();

    const fact = indexRawTransaction(ratingTx.hex, store);

    expect(fact.type).toBe('RATING_ISSUED');
    expect(fact.raterPkh).toBe(binToHex(partyA.pkh));
    expect(fact.rateePkh).toBe(binToHex(partyB.pkh));
    expect(fact.score).toBe(4);
    expect(fact.valid).toBe(true);
  });

  it('marca como inválido un RATING_ISSUED cuyo score está fuera del rango 1-5 (SPEC-004 RF-04)', async () => {
    for (const outOfRangeScore of [0, 6, 200]) {
      const { partyA, partyB, tx: receiptTx } = await genesisReceipt();

      const store = createMemoryStore();
      indexRawTransaction(receiptTx.hex, store);

      const ratingRightUtxo = {
        txid: receiptTx.txid,
        vout: 1,
        satoshis: 1000n,
        token: { category: receiptTx.txid, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } },
      };
      provider.addUtxo(partyA.address, ratingRightUtxo);
      const feeUtxo = fundFeeUtxo(partyA);

      const ratingTx = await new TransactionBuilder({ provider })
        .addInput(ratingRightUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
        .addInput(feeUtxo, new SignatureTemplate(partyA.privateKey).unlockP2PKH())
        .addOutput(ratingOpReturnOutput(outOfRangeScore))
        .addOutput({ to: partyA.address, amount: 40_000n })
        .send();

      const fact = indexRawTransaction(ratingTx.hex, store);

      // El patrón se reconoce (no se ignora silenciosamente) pero se
      // marca inválido: la transacción se considera inválida (RF-04).
      expect(fact.type).toBe('RATING_ISSUED');
      expect(fact.score).toBe(outOfRangeScore);
      expect(fact.valid).toBe(false);
    }
  });

  it('devuelve null para una transacción que no calza con ninguna forma RepID', async () => {
    const someone = makeParty();
    const utxo = { txid: 'ee'.repeat(32), vout: 0, satoshis: 20_000n };
    provider.addUtxo(someone.address, utxo);

    const tx = await new TransactionBuilder({ provider })
      .addInput(utxo, new SignatureTemplate(someone.privateKey).unlockP2PKH())
      .addOutput({ to: someone.address, amount: 15_000n })
      .send();

    const store = createMemoryStore();
    expect(indexRawTransaction(tx.hex, store)).toBeNull();
  });
});

// --- Tests: persistencia JSON (TASK-004, Opción A) --------------------------

describe('Indexer — persistencia JSON (createJsonFileStore)', () => {
  it('persiste las Rating Rights a disco tras indexar y las recarga en una instancia nueva', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repid-store-'));
 const filePath = join(dir, 'store.json');
    try {
      const { partyA, partyB, tx } = await genesisReceipt();

      const store1 = createJsonFileStore(filePath);
      const fact = indexRawTransaction(tx.hex, store1);
      expect(fact.type).toBe('RECEIPT_GENESIS');

      // Un segundo "proceso" (nueva instancia del store, mismo archivo)
      // debe recuperar las Rating Rights indexadas del primero.
      const store2 = createJsonFileStore(filePath);
      const rr = fact.ratingRights[0];
      expect(store2.getRatingRight(rr.outpoint)).toMatchObject({
        ownerPkh: rr.ownerPkh,
        ratesPkh: rr.ratesPkh,
      });

      // El archivo existe y tiene el formato esperado.
      const onDisk = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(onDisk.ratingRights).toBeTruthy();
      expect(Object.keys(onDisk.ratingRights)).toHaveLength(2);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('arranca limpio si el archivo de persistencia no existe (ENOENT)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repid-store-'));
    const filePath = join(dir, 'store.json');
    try {
      const store = createJsonFileStore(filePath); // no debe lanzar
      expect(store.getRatingRight('abc:0')).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('sobreescribe el archivo si ya contenía un estado previo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'repid-store-'));
    const filePath = join(dir, 'store.json');
    try {
      writeFileSync(filePath, JSON.stringify({ ratingRights: { old: { ownerPkh: 'x', ratesPkh: 'y' } } }), 'utf8');

      const store = createJsonFileStore(filePath);
      store.trackRatingRight('new:0', { ownerPkh: 'a', ratesPkh: 'b' });

      const onDisk = JSON.parse(readFileSync(filePath, 'utf8'));
      expect(onDisk.ratingRights['old']).toBeTruthy();
      expect(onDisk.ratingRights['new:0']).toBeTruthy();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Utilidad de test: el txid usado como UTXO mock ya está en "display
// order" (como lo entrega el SDK), así que solo lo normalizamos a bytes
// para comparar contra lo que devuelve el indexer.
function hexToBinDisplay(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
