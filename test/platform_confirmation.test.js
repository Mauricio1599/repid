import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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
import receiptArtifact from '../contracts/receipt_genesis.json' with { type: 'json' };
import {
  indexRawTransaction, createMemoryStore, createJsonFileStore, REPID_PLATFORM_TAG,
} from '../indexer/repid-indexer.mjs';

// --- Helpers -------------------------------------------------------------

const provider = new MockNetworkProvider();

let seedCounter = 100;
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

// Construye el output OP_RETURN de una PLATFORM_CONFIRMATION (SPEC-003
// RF-06): OP_RETURN <tag> <txid del Receipt (32 bytes)>.
function platformOpReturnOutput(receiptTxidHex) {
  const tagBytes = utf8ToBin(REPID_PLATFORM_TAG);
  const txidBytes = hexToBytes(receiptTxidHex);
  const bytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, txidBytes.length, ...txidBytes,
  ]);
  return { to: bytecode, amount: 0n };
}

// Da de alta un Receipt y lo deja indexado en `store` (el indexer también
// lo registra para que la confirmación pueda referenciarlo).
async function genesisAndIndexReceipt(store) {
  const partyA = makeParty();
  const partyB = makeParty();
  const contract = new Contract(receiptArtifact, [partyA.pkh, partyB.pkh], { provider });
  const utxo = { txid: 'bb'.repeat(32), vout: 0, satoshis: 10_000n };
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

  const fact = indexRawTransaction(tx.hex, store);
  if (fact.type !== 'RECEIPT_GENESIS') throw new Error('No se pudo generar el Receipt de test');
  return { fact, tx, partyA, partyB };
}

// Aporta a `owner` un UTXO de fondos normales para que la plataforma pueda
// gastarlo como atestación (P2PKH) y pagar la comisión.
function fundPlatformUtxo(owner, satoshis = 50_000n) {
  const utxo = { txid: 'cc'.repeat(32), vout: 0, satoshis };
  provider.addUtxo(owner.address, utxo);
  return utxo;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

beforeEach(() => {
  provider.reset();
  seedCounter = 100;
});

// --- Tests: PLATFORM_CONFIRMATION (SPEC-003 RF-06, patrón C) --------------

describe('PLATFORM_CONFIRMATION', () => {
  it('reconoce una atestación de plataforma que referencia un Receipt ya indexado', async () => {
    const store = createMemoryStore();
    const { fact: receiptFact } = await genesisAndIndexReceipt(store);

    // La plataforma (C) gasta su propio UTXO P2PKH con el OP_RETURN que
    // referencia el txid del Receipt. No necesita Identidad propia.
    const platform = makeParty();
    const feeUtxo = fundPlatformUtxo(platform);

    const tx = await new TransactionBuilder({ provider })
      .addInput(feeUtxo, new SignatureTemplate(platform.privateKey).unlockP2PKH())
      .addOutput(platformOpReturnOutput(receiptFact.txid))
      .addOutput({ to: platform.address, amount: 40_000n })
      .send();

    const fact = indexRawTransaction(tx.hex, store);

    expect(fact.type).toBe('PLATFORM_CONFIRMATION');
    expect(fact.receiptTxid).toBe(receiptFact.txid);
    expect(fact.platformPkh).toBe(binToHex(platform.pkh));
    expect(fact.valid).toBe(true);
  });

  it('marca como inválida una confirmación que referencia un Receipt desconocido', async () => {
    const store = createMemoryStore();

    const platform = makeParty();
    const feeUtxo = fundPlatformUtxo(platform);

    const fakeReceiptTxid = 'ab'.repeat(32);
    const tx = await new TransactionBuilder({ provider })
      .addInput(feeUtxo, new SignatureTemplate(platform.privateKey).unlockP2PKH())
      .addOutput(platformOpReturnOutput(fakeReceiptTxid))
      .addOutput({ to: platform.address, amount: 40_000n })
      .send();

    const fact = indexRawTransaction(tx.hex, store);

    // Se reconoce el patrón (no se ignora en silencio) pero la referencia
    // es a un Receipt que el indexer nunca vio => interpretación inválida.
    expect(fact.type).toBe('PLATFORM_CONFIRMATION');
    expect(fact.receiptTxid).toBe(fakeReceiptTxid);
    expect(fact.valid).toBe(false);
  });

  it('no reconoce un OP_RETURN con un tag ajeno a RepID', async () => {
    const store = createMemoryStore();
    await genesisAndIndexReceipt(store);

    const platform = makeParty();
    const feeUtxo = fundPlatformUtxo(platform);

    const alienBytes = utf8ToBin('NOTREPID5');
    const bytecode = new Uint8Array([0x6a, alienBytes.length, ...alienBytes]);
    const tx = await new TransactionBuilder({ provider })
      .addInput(feeUtxo, new SignatureTemplate(platform.privateKey).unlockP2PKH())
      .addOutput({ to: bytecode, amount: 0n })
      .addOutput({ to: platform.address, amount: 40_000n })
      .send();

    expect(indexRawTransaction(tx.hex, store)).toBeNull();
  });
});

// --- Tests: persistencia del índice de Receipts (TASK-016) ---------------

describe('Indexer — receipts persistidos (TASK-016)', () => {
  it('persiste el índice de Receipts y lo recarga en una instancia nueva del store', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'repid-receipts-'));
    const filePath = join(dir, 'store.json');
    try {
      const store1 = createJsonFileStore(filePath);
      const { fact } = await genesisAndIndexReceipt(store1);
      expect(fact.type).toBe('RECEIPT_GENESIS');

      const store2 = createJsonFileStore(filePath);
      expect(store2.getReceipt(fact.txid)).toMatchObject({
        receiptOwnerPkh: fact.receiptOwnerPkh,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});