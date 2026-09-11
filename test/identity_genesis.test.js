import { describe, it, expect, beforeEach } from 'vitest';
import {
  Contract,
  MockNetworkProvider,
  TransactionBuilder,
  FailedRequireError,
} from 'cashscript';
import { hexToBin, generatePrivateKey, secp256k1, hash160, lockingBytecodeToCashAddress } from '@bitauth/libauth';
import artifact from '../contracts/identity_genesis.json' with { type: 'json' };

// --- Helpers -----------------------------------------------------------

const provider = new MockNetworkProvider();

// Genera un dueño (owner) real: clave privada -> pubkey -> pkh -> dirección P2PKH.
let ownerSeedCounter = 0;
function makeOwner() {
  ownerSeedCounter += 1;
  const seed = ownerSeedCounter;
  const privateKey = generatePrivateKey(() => new Uint8Array(32).fill(seed));
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const pkh = hash160(publicKey); // bytes20
  const p2pkhBytecode = new Uint8Array([
    0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac, // OP_DUP OP_HASH160 <pkh> OP_EQUALVERIFY OP_CHECKSIG
  ]);
  const addressResult = lockingBytecodeToCashAddress({
    bytecode: p2pkhBytecode,
    prefix: 'bchtest',
    tokenSupport: true, // dirección con soporte de tokens (necesaria para recibir el NFT)
  });
  if (typeof addressResult === 'string') throw new Error(addressResult);
  return { pkh, address: addressResult.address };
}

function makeContract(ownerPkh) {
  return new Contract(artifact, [ownerPkh], { provider });
}

// Añade un UTXO de "financiamiento" al contrato, en vout 0 salvo que se indique otra cosa.
function fundContract(contract, vout = 0) {
  const txid = 'aa'.repeat(32);
  const utxo = { txid, vout, satoshis: 10_000n };
  provider.addUtxo(contract.address, utxo);
  return utxo;
}

beforeEach(() => {
  provider.reset();
});

// --- Tests ---------------------------------------------------------------

describe('IdentityGenesisValidator', () => {
  it('mintea la identidad cuando el UTXO gastado viene de vout 0 y el cambio vuelve al propietario', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const tx = await new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    expect(tx.txid).toBeTruthy();
  });

  it('rechaza el mint si el UTXO gastado NO viene de vout 0', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 1); // vout inválido para genesis

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si la categoría del token no coincide con el txid gastado', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);
    const wrongCategory = 'bb'.repeat(32);

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: wrongCategory, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si el output lleva cantidad fungible distinta de cero', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 5n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si el NFT no queda bloqueado al P2PKH del propietario', async () => {
    const owner = makeOwner();
    const attacker = makeOwner(); // otra dirección distinta al owner del constructor
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: attacker.address, // debería ir a owner.address
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('acepta el output de cambio si vuelve al P2PKH del propietario (red real)', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const tx = await new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 8000n })
      .send();

    expect(tx.txid).toBeTruthy();
  });

  it('rechaza el mint si el cambio no vuelve al propietario (fuga de valor)', async () => {
    const owner = makeOwner();
    const attacker = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: attacker.address, amount: 8000n }) // el cambio debería ir a owner
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });

  it('rechaza el mint si hay más de dos outputs (minteo oculto adicional)', async () => {
    const owner = makeOwner();
    const contract = makeContract(owner.pkh);
    const utxo = fundContract(contract, 0);

    const txPromise = new TransactionBuilder({ provider })
      .addInput(utxo, contract.unlock.mint())
      .addOutput({
        to: owner.address,
        amount: 1000n,
        token: { category: utxo.txid, amount: 0n, nft: { capability: 'none', commitment: '' } },
      })
      .addOutput({ to: owner.address, amount: 7000n })
      .addOutput({ to: owner.address, amount: 1000n })
      .send();

    await expect(txPromise).rejects.toThrow(FailedRequireError);
  });
});
