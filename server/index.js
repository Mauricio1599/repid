// RepID — servidor de prototipo
//
// Expone una API REST que ejecuta el ciclo completo del protocolo sobre
// una red BCH. Por defecto usa MockNetworkProvider (cadena simulada en
// memoria, sin fondos reales) para demostrar el flujo y correr los tests
// offline. Con REPID_NETWORK=chipnet ejecuta las mismas transacciones en
// la red de pruebas Chipnet (CashTokens reales, VM real de Bitcoin) vía un
// worker aislado (context/network-processor.mjs) — ver TASK-022/023.
//
// ADVERTENCIA DE DISEÑO — SOLO DEMO: este servidor guarda las claves
// privadas de las wallets que crea, en memoria, para poder firmar en
// nombre del usuario sin pedirle que maneje claves desde el navegador.
// Esto es aceptable únicamente porque las wallets son sintéticas (Mock) o
// de prueba (Chipnet, tBCH sin valor) y viven solo mientras el proceso
// está corriendo. Un RepID real firma siempre del lado del cliente; el
// servidor nunca debe custodiar claves.
import express from 'express';
import path from 'node:path';
import crypto from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  Contract, MockNetworkProvider, TransactionBuilder, SignatureTemplate,
} from 'cashscript';
import { ChipnetNetworkProvider, chipnetFeeRate } from './chipnet-provider.mjs';
import {
  generatePrivateKey, secp256k1, hash160, lockingBytecodeToCashAddress, binToHex, utf8ToBin,
} from '@bitauth/libauth';
import identityArtifact from '../contracts/identity_genesis.json' with { type: 'json' };
import receiptArtifact from '../contracts/receipt_genesis.json' with { type: 'json' };
import {
  indexRawTransaction, createJsonFileStore, REPID_RATING_TAG, REPID_PLATFORM_TAG, REPID_TRUST_TAG,
} from '../indexer/repid-indexer.mjs';
import {
  validateInteraction, buildInteraction, toReceiptParts,
} from '../interaction/repid-interaction.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3787;

// Modo de red: elige la cadena sobre la que corre el prototipo.
//   REPID_NETWORK=mock    (default) — cadena simulada, sin fondos reales.
//   REPID_NETWORK=chipnet — red de pruebas real (tBCH + CashTokens reales).
const NETWORK = (process.env.REPID_NETWORK || 'mock').toLowerCase();
const useChipnet = NETWORK === 'chipnet';

// Persistencia del Indexer (TASK-004, Opción A): el estado de Rating
// Rights sobrevive reinicios del proceso. Las wallets y la cadena mock,
// en cambio, se regeneran en cada arranque — es una limitación del demo
// (las claves viven en memoria), no del protocolo.
// REPID_DATA_DIR permite aislar la persistencia (lo usan los tests E2E).
const DATA_DIR = process.env.REPID_DATA_DIR || path.join(__dirname, '..', 'data');
mkdirSync(DATA_DIR, { recursive: true });
const INDEXER_STORE_PATH = path.join(DATA_DIR, 'indexer-store.json');

// Persistencia de wallets y estado local del prototipo (SOLO Chipnet,
// TASK-025): las claves de las wallets de prueba sobreviven reinicios del
// proceso (necesario para no perder el tBCH con el que se haya fondeado la
// demo, y para no volver a mintear una identidad que ya existe on-chain).
// En Mock todo sigue en memoria como antes. ADVERTENCIA: no son wallets de
// producción — el servidor guarda claves de prueba (tBCH, sin valor).
const WALLET_STORE_PATH = path.join(DATA_DIR, 'wallet.json');
const STATE_STORE_PATH = path.join(DATA_DIR, 'repid-state.json');

// --- Estado en memoria del proceso (vive mientras el server corre) ------

const provider = useChipnet ? new ChipnetNetworkProvider() : new MockNetworkProvider();
let indexerStore = createJsonFileStore(INDEXER_STORE_PATH);
const wallets = new Map(); // pkhHex -> { privateKey, publicKey, pkh, pkhHex, address }
const identitiesByPkh = new Map(); // pkhHex -> hecho IDENTITY_GENESIS
const interactionsByTxid = new Map(); // txid -> hecho RECEIPT_GENESIS
const availableRatingRights = new Map(); // outpoint -> { ownerPkh, ratesPkh }
const facts = []; // log cronológico completo, para el feed de actividad
const rawTransactions = []; // feed del "nodo": hex crudo de cada tx entrante (demo)

function randomBytes32() {
  return new Uint8Array(crypto.randomBytes(32));
}

function randomTxid() {
  return crypto.randomBytes(32).toString('hex');
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}

// En Mock cada wallet nace con BCH "de juguete" para pagar comisiones.
// En Chipnet los fondos son reales (tBCH): las wallets se crean vacías y el
// usuario las alimenta con el faucet (o con la ayuda de funding de TASK-025).
function createWallet() {
  const privateKey = generatePrivateKey(randomBytes32);
  const publicKey = secp256k1.derivePublicKeyCompressed(privateKey);
  const pkh = hash160(publicKey);
  const pkhHex = binToHex(pkh);
  const p2pkhBytecode = new Uint8Array([0x76, 0xa9, 0x14, ...pkh, 0x88, 0xac]);
  const addressResult = lockingBytecodeToCashAddress({
    bytecode: p2pkhBytecode, prefix: 'bchtest', tokenSupport: true,
  });
  if (typeof addressResult === 'string') throw new Error(addressResult);

  const wallet = {
    privateKey, publicKey, pkh, pkhHex, address: addressResult.address,
  };
  wallets.set(pkhHex, wallet);

  if (!useChipnet) {
    provider.addUtxo(wallet.address, { txid: randomTxid(), vout: 0, satoshis: 100_000n });
  } else {
    saveWalletsToDisk();
  }
  return wallet;
}

// --- Persistencia del prototipo en Chipnet (TASK-025) ---------------------
//
// En modo chipnet, wallets y estado local se guardan en data/ para que la
// demo sobreviva reinicios (los fondos tBCH de una wallet viven on-chain,
// no en el proceso). En mock nada de esto se usa.

function saveWalletsToDisk() {
  if (!useChipnet) return;
  const serialized = [...wallets.values()].map((w) => ({
    privateKeyHex: binToHex(w.privateKey),
    publicKeyHex: binToHex(w.publicKey),
    pkhHex: w.pkhHex,
    address: w.address,
  }));
  writeFileSync(WALLET_STORE_PATH, JSON.stringify(serialized, null, 2), 'utf8');
}

function loadWalletsFromDisk() {
  if (!useChipnet || !existsSync(WALLET_STORE_PATH)) return;
  try {
    const serialized = JSON.parse(readFileSync(WALLET_STORE_PATH, 'utf8'));
    for (const s of serialized) {
      const wallet = {
        privateKey: hexToBytes(s.privateKeyHex),
        publicKey: hexToBytes(s.publicKeyHex),
        pkh: hexToBytes(s.pkhHex),
        pkhHex: s.pkhHex,
        address: s.address,
      };
      wallets.set(s.pkhHex, wallet);
    }
  } catch (err) {
    console.error(`[chipnet] no se pudieron cargar wallets persistidas: ${err.message}`);
  }
}

function persistState() {
  if (!useChipnet) return;
  writeFileSync(STATE_STORE_PATH, JSON.stringify({
    facts,
    rawTransactions,
    identitiesByPkh: [...identitiesByPkh.entries()],
    interactionsByTxid: [...interactionsByTxid.entries()],
    availableRatingRights: [...availableRatingRights.entries()],
  }, null, 2), 'utf8');
}

function loadStateFromDisk() {
  if (!useChipnet || !existsSync(STATE_STORE_PATH)) return;
  try {
    const saved = JSON.parse(readFileSync(STATE_STORE_PATH, 'utf8'));
    facts.push(...(saved.facts ?? []));
    rawTransactions.push(...(saved.rawTransactions ?? []));
    for (const [k, v] of saved.identitiesByPkh ?? []) identitiesByPkh.set(k, v);
    for (const [k, v] of saved.interactionsByTxid ?? []) interactionsByTxid.set(k, v);
    for (const [k, v] of saved.availableRatingRights ?? []) availableRatingRights.set(k, v);
  } catch (err) {
    console.error(`[chipnet] no se pudo cargar el estado persistido: ${err.message}`);
  }
}

function requireWallet(pkhHex) {
  const wallet = wallets.get(pkhHex);
  if (!wallet) {
    const err = new Error(`Wallet desconocida: ${pkhHex}`);
    err.status = 404;
    throw err;
  }
  return wallet;
}

// Gastos P2PKH del prototipo (calificación, confirmación, confianza y
// tx ajenas). El fee se paga con un UTXO sin tokens de la propia wallet y
// el cambio se agrega con addBchChangeOutputIfNeeded a la misma wallet,
// usando el fee real de la red (Mock: 1 sat/byte sintético).
async function spendP2pkh(wallet, opReturnBytecode, extraInputs = []) {
  const utxos = await provider.getUtxos(wallet.address);
  const feeUtxo = utxos.find((u) => !u.token);
  if (!feeUtxo) {
    const err = new Error(useChipnet
      ? `La wallet ${wallet.pkhHex} no tiene fondos tBCH para pagar la comisión. Pedí fondos en tbch.googol.cash y enviá a ${wallet.address}`
      : 'La wallet no tiene fondos para pagar la comisión');
    err.status = 409;
    throw err;
  }

  const feeRate = useChipnet ? await chipnetFeeRate() : 1;
  const builder = new TransactionBuilder({ provider })
    .addInput(feeUtxo, new SignatureTemplate(wallet.privateKey).unlockP2PKH())
    .addOutput({ to: opReturnBytecode, amount: 0n });

  for (const { utxo, unlocker } of extraInputs) builder.addInput(utxo, unlocker);
  builder.addBchChangeOutputIfNeeded({ to: wallet.address, feeRate });

  return builder.send();
}

// TASK-026 — transferencia P2PKH→P2PKH entre wallets del prototipo (demo-only).
// Sin OP_RETURN: no es un hecho RepID, el indexer simplemente la ignora.
// Sirve para repartir tBCH desde la wallet fondeada hacia las wallets que la
// demo crea al vuelo (en Mock no se usa: las wallets nacen con fondos).
async function transferSats(fromPkhHex, toPkhHex, amount) {
  const from = requireWallet(fromPkhHex);
  const to = requireWallet(toPkhHex);
  const utxos = await provider.getUtxos(from.address);
  const feeUtxo = utxos.find((u) => !u.token);
  if (!feeUtxo) {
    const err = new Error(useChipnet
      ? `La wallet ${from.pkhHex} no tiene fondos tBCH para pagar la comisión. Pedí fondos en tbch.googol.cash y enviá a ${from.address}`
      : 'La wallet no tiene fondos para pagar la comisión');
    err.status = 409;
    throw err;
  }

  const feeRate = useChipnet ? await chipnetFeeRate() : 1;
  const builder = new TransactionBuilder({ provider })
    .addInput(feeUtxo, new SignatureTemplate(from.privateKey).unlockP2PKH())
    .addOutput({ to: to.address, amount });

  builder.addBchChangeOutputIfNeeded({ to: from.address, feeRate });

  return builder.send();
}

function recordFact(fact) {
  facts.push({ ...fact, at: new Date().toISOString() });
  return fact;
}

// Índice la transacción Y la "escucho" como vería la red un nodo: registro
// el hex crudo en el feed del indexer, con el tipo de hecho reconocido (o
// null si la forma no calza con ninguna RepID).
function recordFromChain(txHex, txid) {
  const fact = indexRawTransaction(txHex, indexerStore);
  rawTransactions.push({
    txid, hex: txHex, at: new Date().toISOString(), factType: fact ? fact.type : null,
  });
  return fact;
}

function walletSummary(w) {
  return { pkh: w.pkhHex, address: w.address };
}

// --- Operaciones del protocolo (helpers reutilizables) --------------------
//
// Cada helper ejecuta la transacción en la cadena mock, la indexa y
// registra el hecho + el hex en el feed del nodo. Los handlers de la API
// se encargan de validar la entrada (400/403/404/409) y delegar acá;
// /api/demo/run las usa para poblar la demo de una sola pasada.

// Crea el UTXO de genesis del contrato con las condiciones que exige el
// covenant y la VM real de Bitcoin:
//   - vout 0 (regla de genesis de CashTokens: outpointIndex == 0).
//   - todo el saldo en un único output dirigido al contrato.
// En Mock esto se inyecta directo (no hay cadena). En Chipnet se construye
// una transacción de funding real 1-input/1-output; el output 0 queda
// bloqueado al contrato y el surplus del input paga la comisión.
async function createGenesisFunding(funderPkh, contract, fundingAmount = 10_000n) {
  if (!useChipnet) {
    const utxo = { txid: randomTxid(), vout: 0, satoshis: fundingAmount };
    provider.addUtxo(contract.address, utxo);
    return utxo;
  }

  const funder = requireWallet(funderPkh);
  const leaves = await provider.getUtxos(funder.address);
  const feeUtxo = leaves.find((u) => !u.token);
  if (!feeUtxo) {
    const err = new Error(`La wallet ${funder.pkhHex} no tiene fondos tBCH para financiar la génesis. Pedí fondos en tbch.googol.cash y enviá a ${funder.address}`);
    err.status = 409;
    throw err;
  }

  const feeRate = await chipnetFeeRate();
  // Tx de 1 input P2PKH + 1 output P2PKH ≈ 226 bytes; se estima holgado.
  const estimatedFee = 400n * BigInt(Math.max(1, feeRate));
  const amount = feeUtxo.satoshis - estimatedFee;
  if (amount <= 0n) {
    const err = new Error(`Fondos tBCH insuficientes para financiar la génesis (${feeUtxo.satoshis} sat). Pedí más tBCH en tbch.googol.cash`);
    err.status = 409;
    throw err;
  }

  const funding = await new TransactionBuilder({ provider })
    .addInput(feeUtxo, new SignatureTemplate(funder.privateKey).unlockP2PKH())
    .addOutput({ to: contract.address, amount })
    .send();

  // recordFact() lo indexaría como hecho no-RepID (se descarta); solo pasa
  // por el feed del "nodo" para que la génesis del contrato sea rastreable.
  const fact = recordFromChain(funding.hex, funding.txid);
  if (fact) recordFact(fact);
  return { txid: funding.txid, vout: 0, satoshis: amount };
}

function genesisFeeRate() {
  return useChipnet ? chipnetFeeRate() : Promise.resolve(1);
}

async function mintIdentity(ownerPkh) {
  const owner = requireWallet(ownerPkh);
  if (identitiesByPkh.has(ownerPkh)) {
    const err = new Error('Esta wallet ya tiene una identidad');
    err.status = 409;
    throw err;
  }

  const contract = new Contract(identityArtifact, [owner.pkh], { provider });
  const genesisUtxo = await createGenesisFunding(owner.pkhHex, contract);
  const category = genesisUtxo.txid;

  const tx = await new TransactionBuilder({ provider })
    .addInput(genesisUtxo, contract.unlock.mint())
    .addOutput({
      to: owner.address,
      amount: 1000n,
      token: { category, amount: 0n, nft: { capability: 'none', commitment: '' } },
    })
    .addBchChangeOutputIfNeeded({ to: owner.address, feeRate: await genesisFeeRate() })
    .send();

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  identitiesByPkh.set(owner.pkhHex, fact);
  persistState();
  return fact;
}

async function createInteraction(partyAInput, partyBInput) {
  const interaction = buildInteraction({ partyA: partyAInput, partyB: partyBInput });
  const { partyAPkh, partyBPkh } = toReceiptParts(interaction);
  const partyA = requireWallet(partyAPkh);
  const partyB = requireWallet(partyBPkh);

  const contract = new Contract(receiptArtifact, [partyA.pkh, partyB.pkh], { provider });
  // partyA financia la génesis: de ahí que el cambio del covenant vuelva
  // a partyA (output 3).
  const genesisUtxo = await createGenesisFunding(partyA.pkhHex, contract);
  const category = genesisUtxo.txid;

  const tx = await new TransactionBuilder({ provider })
    .addInput(
      genesisUtxo,
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
    .addBchChangeOutputIfNeeded({ to: partyA.address, feeRate: await genesisFeeRate() })
    .send();

  const fact = recordFact({ ...recordFromChain(tx.hex, tx.txid), roles: [interaction.partyA.role, interaction.partyB.role] });
  interactionsByTxid.set(tx.txid, fact);
  for (const rr of fact.ratingRights) availableRatingRights.set(rr.outpoint, rr);
  persistState();
  return fact;
}

async function platformConfirm(platformPkh, receiptTxid) {
  const platform = requireWallet(platformPkh);

  const tagBytes = utf8ToBin(REPID_PLATFORM_TAG);
  const txidBytes = hexToBytes(receiptTxid);
  const opReturnBytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, txidBytes.length, ...txidBytes,
  ]);

  const tx = await spendP2pkh(platform, opReturnBytecode);
  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  persistState();
  return fact;
}

async function issueRating(outpoint, raterPkh, score) {
  const rater = requireWallet(raterPkh);
  const ratingRight = indexerStore.getRatingRight(outpoint);
  if (!ratingRight) {
    const err = new Error('Rating Right no encontrada');
    err.status = 404;
    throw err;
  }
  if (ratingRight.ownerPkh !== raterPkh) {
    const err = new Error('Esta Rating Right no pertenece a esa wallet');
    err.status = 403;
    throw err;
  }

  const [txid, voutStr] = outpoint.split(':');
  const vout = Number(voutStr);
  const utxos = await provider.getUtxos(rater.address);
  const ratingRightUtxo = utxos.find((u) => u.txid === txid && u.vout === vout);
  if (!ratingRightUtxo) {
    const err = new Error('Esta Rating Right ya fue usada');
    err.status = 409;
    throw err;
  }

  const tagBytes = utf8ToBin(REPID_RATING_TAG);
  const opReturnBytecode = new Uint8Array([0x6a, tagBytes.length, ...tagBytes, 1, score]);

  const tx = await spendP2pkh(rater, opReturnBytecode, [{
    utxo: ratingRightUtxo,
    unlocker: new SignatureTemplate(rater.privateKey).unlockP2PKH(),
  }]);

  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  availableRatingRights.delete(outpoint);
  persistState();
  return fact;
}

async function createTrustLink(trusterPkh, trustedPkh) {
  const truster = requireWallet(trusterPkh);
  requireWallet(trustedPkh);

  const tagBytes = utf8ToBin(REPID_TRUST_TAG);
  const pkhBytes = hexToBytes(trustedPkh);
  const opReturnBytecode = new Uint8Array([
    0x6a, tagBytes.length, ...tagBytes, pkhBytes.length, ...pkhBytes,
  ]);

  const tx = await spendP2pkh(truster, opReturnBytecode);
  const fact = recordFact(recordFromChain(tx.hex, tx.txid));
  persistState();
  return fact;
}

// --- App -----------------------------------------------------------------

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Wallets sintéticas del demo

app.post('/api/wallets', (req, res) => {
  res.status(201).json(walletSummary(createWallet()));
});

app.get('/api/status', (req, res) => {
  res.json({ network: useChipnet ? 'chipnet' : 'mock' });
});

app.get('/api/wallets', (req, res) => {
  res.json([...wallets.values()].map(walletSummary));
});

// TASK-026 — demo-only: transferencia entre wallets del prototipo (permite
// repartir tBCH desde la wallet fondeada hacia las que la demo crea al vuelo).

app.post('/api/transfer', async (req, res, next) => {
  try {
    const { fromPkh, toPkh, amount } = req.body ?? {};
    const from = requireWallet(fromPkh);
    requireWallet(toPkh);
    if (!/^\d+$/.test(String(amount))) {
      const err = new Error('amount debe ser un número entero positivo de sats');
      err.status = 400;
      throw err;
    }
    const num = Number(BigInt(amount));
    if (!Number.isSafeInteger(num) || num <= 0) {
      const err = new Error('amount debe ser un número entero positivo de sats');
      err.status = 400;
      throw err;
    }
    if (num < 546) {
      const err = new Error('amount debe ser de al menos 546 sats (mínimo de polvo de la red)');
      err.status = 400;
      throw err;
    }
    const tx = await transferSats(fromPkh, toPkh, BigInt(num));
    res.status(201).json({ txid: tx.txid, fromPkh, toPkh, amount: String(BigInt(num)) });
  } catch (err) { next(err); }
});

// TASK-025 — funding UX: saldo real de una wallet (on-chain en Chipnet,
// sintético en Mock) más su dirección para fondear con el faucet.

app.get('/api/wallets/:pkh', async (req, res, next) => {
  try {
    const wallet = requireWallet(req.params.pkh);
    const utxos = await provider.getUtxos(wallet.address);
    const sats = utxos
      .filter((u) => !u.token)
      .reduce((sum, u) => sum + BigInt(u.satoshis), 0n);
    res.json({
      ...walletSummary(wallet),
      balanceSats: sats.toString(),
      hasIdentity: identitiesByPkh.has(wallet.pkhHex),
    });
  } catch (err) { next(err); }
});

// TASK-025 — estado de confirmación de una transacción: mempool vs
// confirmada (y en qué altura). En Mock todo llega "confirmado" al instante.

app.get('/api/tx/:txid/status', async (req, res, next) => {
  try {
    if (!useChipnet) {
      return res.json({ confirmed: true, blockHeight: null });
    }
    const { confirmed, blockHeight } = await provider.txStatus(req.params.txid);
    res.json({ confirmed, blockHeight });
  } catch (err) { next(err); }
});

// TASK-026 — hex crudo de una transacción real (Chipnet) para verificar en
// E2E que la tx que produjo un hecho existe on-chain (worker baja el rawtx;
// en Mock devuelve null).

app.get('/api/tx/:txid/raw', async (req, res, next) => {
  try {
    if (!useChipnet) {
      return res.json({ hex: null });
    }
    const hex = await provider.getRawTransaction(req.params.txid);
    res.json({ hex });
  } catch (err) { next(err); }
});

// RFC-001 — Identity Protocol

app.post('/api/identities', async (req, res, next) => {
  try {
    const { ownerPkh } = req.body;
    const fact = await mintIdentity(ownerPkh);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

app.get('/api/identities', (req, res) => {
  res.json([...identitiesByPkh.values()]);
});

// RFC-003/004 — Interaction Receipt + Rating Rights

app.post('/api/interactions', async (req, res, next) => {
  try {
    // SPEC-002: la interacción se define a nivel de aplicación con rol
    // explícito por cada parte; se valida antes de anclar el Recibo.
    const { partyA: reqA, partyB: reqB } = req.body ?? {};
    const validated = validateInteraction({ partyA: reqA, partyB: reqB });
    if (!validated.ok) {
      return res.status(400).json({ error: validated.error });
    }

    const fact = await createInteraction(reqA, reqB);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

app.get('/api/interactions', (req, res) => {
  res.json([...interactionsByTxid.values()]);
});

// SPEC-003 RF-06 — PLATFORM_CONFIRMATION (patrón C): la plataforma
// corrobora, con un gasto P2PKH propio + OP_RETURN, que la interacción
// referenciada ocurrió. Hecho independiente; la génesis del Recibo no
// cambia. La validadora no necesita mintear Identidad.

app.post('/api/platform-confirmations', async (req, res, next) => {
  try {
    const { platformPkh, receiptTxid } = req.body ?? {};
    if (!/^[0-9a-f]{64}$/.test(receiptTxid || '')) {
      return res.status(400).json({ error: 'receiptTxid debe ser un txid válido (64 hex)' });
    }
    if (!indexerStore.getReceipt(receiptTxid)) {
      return res.status(404).json({ error: 'No hay ningún Recibo indexado con ese txid' });
    }

    const fact = await platformConfirm(platformPkh, receiptTxid);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// RFC-004 — ISSUED_RATING (gasto plano P2PKH de una Rating Right)

app.post('/api/ratings', async (req, res, next) => {
  try {
    const { outpoint, raterPkh, score } = req.body;
    if (!Number.isInteger(score) || score < 1 || score > 5) {
      return res.status(400).json({ error: 'score debe ser un entero entre 1 y 5' });
    }
    const fact = await issueRating(outpoint, raterPkh, score);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

// SPEC-006 — TRUST_LINK: declaración unilateral A→B. A gasta su UTXO con
// un OP_RETURN (tag + pkh de B) declarando que confía en B. Sin
// consentimiento de B, sin Rating Rights.

app.post('/api/trust-links', async (req, res, next) => {
  try {
    const { trusterPkh, trustedPkh } = req.body ?? {};
    if (!/^[0-9a-f]{40}$/.test(trusterPkh || '') || !/^[0-9a-f]{40}$/.test(trustedPkh || '')) {
      return res.status(400).json({ error: 'trusterPkh y trustedPkh deben ser pkhs válidos (40 hex)' });
    }
    const fact = await createTrustLink(trusterPkh, trustedPkh);
    res.status(201).json(fact);
  } catch (err) { next(err); }
});

app.get('/api/rating-rights', (req, res) => {
  res.json([...availableRatingRights.entries()].map(([outpoint, rr]) => ({ outpoint, ...rr })));
});

// Ledger / feed de actividad

app.get('/api/facts', (req, res) => {
  res.json(facts);
});

// Vista del indexer (RFC-006): el feed de transacciones crudas como las
// "oye" la red, más el estado interno que el indexer mantiene para poder
// re-identificar gastos (Rating Rights) y validar confirmaciones
// (Receipts). Demo-only, sobre lo que hay en memoria.

app.get('/api/indexer-view', (req, res) => {
  res.json({
    transactions: [...rawTransactions].reverse(),
    stores: indexerStore.snapshot(),
    storeFile: path.basename(INDEXER_STORE_PATH),
  });
});

// Demo-only: envía una transacción que NO es RepID (un OP_RETURN con un
// tag ajeno). El indexer la "ve" entrar pero la descarta — no hay forma
// que calce — y el Ledger no cambia. Sirve para mostrar el filtro de
// reconocimiento por contraste.

app.post('/api/foreign-tx', async (req, res, next) => {
  try {
    let walletWithFunds = null;
    for (const w of wallets.values()) {
      const utxos = await provider.getUtxos(w.address);
      if (utxos.some((u) => !u.token)) { walletWithFunds = w; break; }
    }
    if (!walletWithFunds) {
      const err = new Error(useChipnet
        ? 'No hay ninguna wallet con fondos tBCH para pagar la comisión. Pedí fondos en tbch.googol.cash'
        : 'No hay ninguna wallet con fondos para pagar la comisión');
      err.status = 409;
      throw err;
    }

    const tagBytes = utf8ToBin('HELLO1');
    const msgBytes = utf8ToBin('no soy RepID');
    const opReturnBytecode = new Uint8Array([0x6a, tagBytes.length, ...tagBytes, msgBytes.length, ...msgBytes]);

    const tx = await spendP2pkh(walletWithFunds, opReturnBytecode);

    const fact = recordFromChain(tx.hex, tx.txid);
    res.status(201).json({ txid: tx.txid, hex: tx.hex, recognized: fact ? fact.type : null });
  } catch (err) { next(err); }
});

// Perfil de reputación (capas de interpretación, fuera de la cadena —
// Constitución Art. 1). No pondera ni juzga: solo agrega hechos ya
// indexados para que una persona pueda ver su historia y auditoría. La
// ponderación / anti-sybil queda en la capa de reputación (fuera de
// alcance; ver SPEC-006).

app.get('/api/reputation/:pkh', (req, res) => {
  const { pkh } = req.params;
  if (!/^[0-9a-f]{40}$/.test(pkh)) {
    return res.status(400).json({ error: 'pkh debe ser un pkh válido (40 hex)' });
  }

  const ratingsReceived = [];
  for (const f of facts) {
    if (f.type === 'RATING_ISSUED' && f.rateePkh === pkh && f.valid) {
      ratingsReceived.push({ score: f.score, raterPkh: f.raterPkh, txid: f.txid });
    }
  }
  const total = ratingsReceived.reduce((s, r) => s + r.score, 0);
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of ratingsReceived) distribution[r.score] += 1;

  const trustReceived = facts
    .filter((f) => f.type === 'TRUST_LINK' && f.trustedPkh === pkh && f.valid)
    .map((f) => ({ trusterPkh: f.trusterPkh, txid: f.txid }));

  const ratingsIssued = facts
    .filter((f) => f.type === 'RATING_ISSUED' && f.raterPkh === pkh)
    .map((f) => ({ score: f.score, rateePkh: f.rateePkh, txid: f.txid }));

  const confirmedReceipts = [];
  for (const f of facts) {
    if (f.type !== 'PLATFORM_CONFIRMATION' || !f.valid) continue;
    const receipt = facts.find((x) => x.type === 'RECEIPT_GENESIS' && x.txid === f.receiptTxid);
    if (receipt && receipt.receiptOwnerPkh === pkh) {
      confirmedReceipts.push({ receiptTxid: f.receiptTxid, txid: f.txid });
    }
  }

  res.json({
    pkh,
    hasIdentity: identitiesByPkh.has(pkh),
    identityTxid: identitiesByPkh.get(pkh)?.txid ?? null,
    ratingsReceived,
    avg: ratingsReceived.length ? (total / ratingsReceived.length).toFixed(1) : null,
    distribution,
    ratingsIssued,
    trustReceived,
    confirmedReceipts,
  });
});

// Demo automática (demo-only): puebla el prototipo con el flujo completo
// en una sola pasada, reutilizando las mismas operaciones que la API — no
// introducir ninguna forma nueva. Sirve para que un visitante vea el
// sistema vivo y la vista indexer con tráfico hex de un vistazo.

app.post('/api/demo/run', async (req, res, next) => {
  try {
    // Chipnet (TASK-026): la demo corre igual que en mock, pero las wallets
    // que crea nacen vacías — la wallet fondeada con tBCH la financia vía
    // transferencias P2PKH→P2PKH (20k sats c/u: varias txs de génesis y
    // gastos con margen de sobra).
    let funderPkh = null;
    if (useChipnet) {
      for (const w of wallets.values()) {
        const utxos = await provider.getUtxos(w.address);
        if (utxos.some((u) => !u.token)) { funderPkh = w.pkhHex; break; }
      }
      if (!funderPkh) {
        const err = new Error('Fundá primero una wallet con tBCH (faucet tbch.googol.cash) para poder pagar las comisiones de la demo');
        err.status = 409;
        throw err;
      }
    }
    const a = createWallet();
    const b = createWallet();
    const platform = createWallet();
    if (funderPkh) {
      for (const w of [a, b, platform]) {
        await transferSats(funderPkh, w.pkhHex, 20_000n);
      }
    }

    await mintIdentity(a.pkhHex);

    const itx1 = await createInteraction(
      { pkh: a.pkhHex, role: 'pasajero' },
      { pkh: b.pkhHex, role: 'conductor' },
    );
    const itx2 = await createInteraction(
      { pkh: b.pkhHex, role: 'comprador' },
      { pkh: a.pkhHex, role: 'vendedor' },
    );

    // txs, outpoint txid:1 = Rating Right del partyA (la que califica al B).
    await issueRating(itx1.ratingRights[0].outpoint, a.pkhHex, 5);
    await issueRating(itx2.ratingRights[0].outpoint, b.pkhHex, 4);

    await platformConfirm(platform.pkhHex, itx1.txid);
    await createTrustLink(a.pkhHex, b.pkhHex);

    res.status(201).json({
      wallets: wallets.size,
      identities: identitiesByPkh.size,
      interactions: interactionsByTxid.size,
      ratings: facts.filter((f) => f.type === 'RATING_ISSUED').length,
      confirmations: facts.filter((f) => f.type === 'PLATFORM_CONFIRMATION').length,
      trustLinks: facts.filter((f) => f.type === 'TRUST_LINK').length,
      facts: facts.length,
    });
  } catch (err) { next(err); }
});

// Demo-only: restablece el prototipo para poder repetir las pruebas de
// cero. Vacía las wallets, los hechos, la cadena mock y la persistencia.

app.post('/api/reset', (req, res) => {
  if (!useChipnet) provider.reset();
  wallets.clear();
  identitiesByPkh.clear();
  interactionsByTxid.clear();
  availableRatingRights.clear();
  facts.length = 0;
  rawTransactions.length = 0;
  writeFileSync(INDEXER_STORE_PATH, '{}', 'utf8');
  indexerStore = createJsonFileStore(INDEXER_STORE_PATH);
  if (useChipnet) {
    // En Chipnet los hechos ya están on-chain: "reiniciar" borra el punto
    // de vista local (wallets de prueba + estado) para volver a cero.
    try {
      rmSync(WALLET_STORE_PATH, { force: true });
      rmSync(STATE_STORE_PATH, { force: true });
    } catch { /* archivos que no existen */ }
  }
  res.json({ ok: true });
});

// Errores

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: err.message });
});

// Boot en Chipnet: restaurar wallets de prueba y estado local persistidos
// (TASK-025). En Mock arranca vacío de cero, como siempre.
loadWalletsFromDisk();
loadStateFromDisk();

app.listen(PORT, () => {
  console.log(`RepID — prototipo corriendo (${useChipnet ? 'red real CHIPNET vía worker aislado' : 'red simulada MOCK'}). Abrí la interfaz en tu navegador:`);
  console.log(`  http://localhost:${PORT}`);
  console.log('Cerrá el servidor con Ctrl+C cuando termines de probar.');
});
