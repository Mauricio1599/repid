import { describe, it, expect, beforeEach } from 'vitest';
import {
  Contract,
  MockNetworkProvider,
  TransactionBuilder,
  SignatureTemplate,
  FailedRequireError,
} from 'cashscript';
import { generatePrivateKey, secp256k1, hash160, lockingBytecodeToCashAddress, binToHex } from '@bitauth/libauth';
import artifact from '../contracts/receipt_genesis.json' with { type: 'json' };

// --- Helpers -----------------------------------------------------------

const provider = new MockNetworkProvider();

let seedCounter = 0;
function makeParty() {
  seedCounter += 1;
  const privateKey = generatePrivateKey(() => new Uint8Array(32).fill(seedCounter));
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const pkh = hash160(publicKey);
  const p2pkhBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
  const addressResult = lockingBytecodeToCashAddress({
    bytecode: p2pkhBytecode,
    prefix: 'bchtest',
    tokenSupport: true,
  });
  if (typeof addressResult === 'string') throw new Error(addressResult);
  return { privateKey, publicKey, pkh, address: addressResult.address };
}

function makeContract(partyA, partyB) {
  return new Contract(artifact, [partyA.pkh, partyB.pkh], { provider });
}

function fundContract(contract, vout = 0) {
  const txid = 'aa'.repeat(32);
  const utxo = { txid, vout, satoshis: 10_000n };
  provider.addUtxo(contract.address, utxo);
  return utxo;
}

// Construye la transacción de genesis "válida por defecto"; cada test
// parte de esta base y rompe una sola condición a la vez.
function buildGenesisTx({
  contract, utxo, partyA, partyB,
  outputs, // si se pasa, reemplaza los 4 outputs por defecto
}) {
  const category = utxo.txid;
  const defaultOutputs = [
    {
      to: partyA.address,
      amount: 1000n,
      token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } },
    },
    {
      to: partyA.address,
      amount: 1000n,
      token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } },
    },
    {
      to: partyB.address,
      amount: 1000n,
      token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } },
    },
    // Cambio P2PKH a partyA (output 3, sin tokens)
    { to: partyA.address, amount: 6000n },
  ];

  const builder = new TransactionBuilder({ provider }).addInput(
    utxo,
    contract.unlock.mint(
      partyA.publicKey,
      new SignatureTemplate(partyA.privateKey),
      partyB.publicKey,
      new SignatureTemplate(partyB.privateKey),
    ),
  );

  for (const output of outputs ?? defaultOutputs) {
    builder.addOutput(output);
  }

  return builder.send();
}

beforeEach(() => {
  provider.reset();
  seedCounter = 0;
});

// --- Tests ---------------------------------------------------------------

describe('ReceiptGenesisValidator', () => {
  it('mintea el Interaction Receipt y las dos Rating Rights cuando ambas partes firman', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);

    const tx = await buildGenesisTx({ contract, utxo, partyA, partyB });

    expect(tx.txid).toBeTruthy();
  });

  it('rechaza el mint si el UTXO gastado NO viene de vout 0', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 1);

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si falta la firma de partyB (solo firma partyA)', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const impostor = makeParty(); // clave distinta a partyB
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);

    const category = utxo.txid;
    const txPromise = new TransactionBuilder({ provider })
      .addInput(
        utxo,
        contract.unlock.mint(
          partyA.publicKey,
          new SignatureTemplate(partyA.privateKey),
          impostor.publicKey, // pubkey que no coincide con partyBPkh
          new SignatureTemplate(impostor.privateKey),
        ),
      )
      .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } })
      .addOutput({ to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } })
      .addOutput({ to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } })
      .addOutput({ to: partyA.address, amount: 6000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si falta el output de cambio (caso de solo 3 salidas)', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const onlyThreeOutputs = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } },
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: onlyThreeOutputs }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si el cambio no vuelve a partyA (fuga de valor)', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const stranger = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const badChange = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } },
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: stranger.address, amount: 6000n }, // el cambio debería ir a partyA
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: badChange }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si el cambio lleva un token (no es plata pura)', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const tokenizedChange = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } },
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: partyA.address, amount: 6000n, token: { category, amount: 1n, nft: { capability: 'none', commitment: '' } } },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: tokenizedChange }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si el Receipt (output 0) no queda bloqueado a partyA', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const badOutputs = [
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } }, // debería ir a partyA
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } },
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: partyA.address, amount: 6000n },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: badOutputs }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si la Rating Right de partyA no referencia a partyB en su commitment', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const badOutputs = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } }, // debería ser partyB.pkh
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: partyA.address, amount: 6000n },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: badOutputs }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si alguna de las 3 salidas lleva cantidad fungible distinta de cero', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;

    const badOutputs = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category, amount: 3n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } }, // amount != 0
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: partyA.address, amount: 6000n },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: badOutputs }))
      .rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si alguna salida usa una categoría de token distinta a la de genesis', async () => {
    const partyA = makeParty();
    const partyB = makeParty();
    const contract = makeContract(partyA, partyB);
    const utxo = fundContract(contract, 0);
    const category = utxo.txid;
    const wrongCategory = 'bb'.repeat(32);

    const badOutputs = [
      { to: partyA.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } } },
      { to: partyA.address, amount: 1000n, token: { category: wrongCategory, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyB.pkh) } } },
      { to: partyB.address, amount: 1000n, token: { category, amount: 0n, nft: { capability: 'none', commitment: binToHex(partyA.pkh) } } },
      { to: partyA.address, amount: 6000n },
    ];

    await expect(buildGenesisTx({ contract, utxo, partyA, partyB, outputs: badOutputs }))
      .rejects.toThrow(FailedRequireError);
  });
});
