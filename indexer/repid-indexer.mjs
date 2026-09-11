// RFC-006 — Indexer Specification
//
// El indexer reconstruye "hechos" RepID a partir del hex crudo de una
// transacción, usando decodeTransactionBCH de libauth (CashTokens-aware).
// No vuelve a validar reglas de covenant (eso ya lo hizo la red al minar
// el bloque): solo reconoce la "forma" de la transacción y extrae datos.
//
// Principio de diseño: la blockchain guarda hechos, la interpretación
// queda fuera de la cadena. Este módulo se limita a la extracción de
// hechos; cualquier juicio de valor sobre una calificación (¿es
// confiable?, ¿se pondera cómo?) vive en una capa posterior, no aquí.
//
// Nota de bytes: dentro de covenants CashScript, tokenCategory se maneja
// en orden "interno" (no invertido). decodeTransactionBCH, en cambio,
// entrega outpointTransactionHash y token.category ya en "display order"
// (el mismo orden que ven wallets y exploradores) — no hay que invertir
// nada aquí.

import { decodeTransactionBCH, binToHex, hashTransaction, hash160 } from '@bitauth/libauth';
import { readFileSync, writeFileSync } from 'node:fs';

// Tags de protocolo para distinguir OP_RETURNs de RepID de cualquier otro
// uso de OP_RETURN en la misma cadena. Elegidos como strings UTF-8 legibles;
// no hay compromiso criptográfico alguno en el valor.
export const REPID_RATING_TAG = 'REPID_RATING1';
export const REPID_PLATFORM_TAG = 'REPID_PLATFORM1';
export const REPID_TRUST_TAG = 'REPID_TRUST1';

const P2PKH_PREFIX = new Uint8Array([0x76, 0xa9, 0x14]); // OP_DUP OP_HASH160 <push 20>
const P2PKH_SUFFIX = new Uint8Array([0x88, 0xac]); // OP_EQUALVERIFY OP_CHECKSIG
const OP_RETURN = 0x6a;

function bytesEqual(a, b, aOffset = 0) {
  if (a.length - aOffset < b.length) return false;
  for (let i = 0; i < b.length; i += 1) {
    if (a[aOffset + i] !== b[i]) return false;
  }
  return true;
}

// Si `lockingBytecode` es un P2PKH estándar, devuelve el pkh (hex, sin
// 0x). Si no, devuelve null. Los tokens de RepID siempre se bloquean a
// P2PKH simple (ver RFC-001/003), nunca a P2SH.
function extractP2PKH(lockingBytecode) {
  if (lockingBytecode.length !== 25) return null;
  if (!bytesEqual(lockingBytecode, P2PKH_PREFIX, 0)) return null;
  if (!bytesEqual(lockingBytecode, P2PKH_SUFFIX, 23)) return null;
  return binToHex(lockingBytecode.slice(3, 23));
}

function isEmptyBytes(b) {
  return !b || b.length === 0;
}

// --- Reconocedores de forma ------------------------------------------

// IDENTITY_GENESIS (RFC-001): 1 o 2 outputs — NFT inmutable (capability
// 'none'), sin fungibles, bloqueado a P2PKH; opcionalmente un output de
// cambio P2PKH sin tokens (requerido por el covenant en red real). Si hay
// un segundo output con token, no es el cambio esperado -> no reconocer.
function tryDecodeIdentityGenesis(decodedTx, txid) {
  if (decodedTx.outputs.length !== 1 && decodedTx.outputs.length !== 2) return null;
  const out = decodedTx.outputs[0];
  if (!out.token || !out.token.nft) return null;
  if (out.token.nft.capability !== 'none') return null;
  if (out.token.amount !== 0n) return null;
  const ownerPkh = extractP2PKH(out.lockingBytecode);
  if (!ownerPkh) return null;
  if (decodedTx.outputs.length === 2 && decodedTx.outputs[1].token) return null;

  return {
    type: 'IDENTITY_GENESIS',
    txid,
    identityCategory: binToHex(out.token.category),
    ownerPkh,
  };
}

// RECEIPT_GENESIS (RFC-003/004): 3 o 4 outputs, misma categoría de token,
// output 0 con commitment vacío (Receipt), outputs 1 y 2 con commitment
// no vacío (Rating Rights) cada uno bloqueado a P2PKH distinto; un 4°
// output de cambio P2PKH sin tokens es opcional (red real). Un 4° output
// con token no es el cambio esperado -> no reconocer.
function tryDecodeReceiptGenesis(decodedTx, txid) {
  const outCount = decodedTx.outputs.length;
  if (outCount !== 3 && outCount !== 4) return null;
  const [receipt, rrA, rrB] = decodedTx.outputs;
  if (outCount === 4 && decodedTx.outputs[3].token) return null;

  const outs = [receipt, rrA, rrB];
  if (outs.some((o) => !o.token || !o.token.nft || o.token.amount !== 0n)) return null;

  const category = binToHex(receipt.token.category);
  if (outs.some((o) => binToHex(o.token.category) !== category)) return null;

  if (!isEmptyBytes(receipt.token.nft.commitment)) return null;
  if (isEmptyBytes(rrA.token.nft.commitment) || isEmptyBytes(rrB.token.nft.commitment)) return null;

  const receiptOwnerPkh = extractP2PKH(receipt.lockingBytecode);
  const partyAPkh = extractP2PKH(rrA.lockingBytecode);
  const partyBPkh = extractP2PKH(rrB.lockingBytecode);
  if (!receiptOwnerPkh || !partyAPkh || !partyBPkh) return null;

  const partyARates = binToHex(rrA.token.nft.commitment);
  const partyBRates = binToHex(rrB.token.nft.commitment);

  // Consistencia cruzada esperada por el contrato: cada Rating Right
  // referencia al pkh de la otra parte en su commitment.
  if (partyARates !== partyBPkh || partyBRates !== partyAPkh) return null;

  return {
    type: 'RECEIPT_GENESIS',
    txid,
    receiptCategory: category,
    receiptOwnerPkh,
    ratingRights: [
      { outpoint: `${txid}:1`, ownerPkh: partyAPkh, ratesPkh: partyBPkh },
      { outpoint: `${txid}:2`, ownerPkh: partyBPkh, ratesPkh: partyAPkh },
    ],
  };
}

// ISSUED_RATING (RFC-004): gasto plano P2PKH de una Rating Right ya
// rastreada por el indexer, acompañado de un OP_RETURN con el tag y el
// puntaje. El NFT no reaparece en ningún output -> queda quemado
// implícitamente, lo cual es justamente lo que impone "una calificación
// por participante" a nivel de UTXO.
//
// Rango de score (SPEC-004 RF-04): solo se admite un score entero 1-5.
// Si el score del OP_RETURN está fuera de rango, el hecho se REconoce
// (para no "ignorarlo") pero se marca `valid: false` — la transacción
// debe considerarse inválida a nivel de interpretación.
const MIN_SCORE = 1;
const MAX_SCORE = 5;

function tryDecodeIssuedRating(decodedTx, txid, lookupRatingRight) {
  const opReturnOut = decodedTx.outputs.find((o) => o.lockingBytecode[0] === OP_RETURN);
  if (!opReturnOut) return null;

  const payload = parseOpReturn(opReturnOut.lockingBytecode);
  if (!payload || payload.tag !== REPID_RATING_TAG) return null;
  if (payload.chunks.length !== 2 || payload.chunks[1].length !== 1) return null;
  const score = payload.chunks[1][0];

  // SPEC-004 RF-04: puntaje fuera de rango => la transacción se considera
  // inválida (pero se reporta, no se ignora silenciosamente).
  const validScore = score >= MIN_SCORE && score <= MAX_SCORE;

  for (const input of decodedTx.inputs) {
    const outpoint = `${binToHex(input.outpointTransactionHash)}:${input.outpointIndex}`;
    const ratingRight = lookupRatingRight(outpoint);
    if (!ratingRight) continue;

    return {
      type: 'RATING_ISSUED',
      txid,
      spentOutpoint: outpoint,
      raterPkh: ratingRight.ownerPkh,
      rateePkh: ratingRight.ratesPkh,
      score,
      valid: validScore,
    };
  }

  return null;
}

// PLATFORM_CONFIRMATION (SPEC-003 RF-06, patrón C): una entidad validadora
// (plataforma/aplicación) corrobora que una interacción ocurrió gastando un
// UTXO P2PKH propio con un OP_RETURN: <tag> <txid del Receipt (32 bytes)>.
// La confirmación es un hecho independiente; no modifica la génesis del
// Recibo. Si el Recibo referenciado no está indexado, el hecho se reconoce
// pero se marca `valid: false` (no se ignora en silencio).
function tryDecodePlatformConfirmation(decodedTx, txid, lookupReceipt) {
  const opReturnOut = decodedTx.outputs.find((o) => o.lockingBytecode[0] === OP_RETURN);
  if (!opReturnOut) return null;

  const payload = parseOpReturn(opReturnOut.lockingBytecode);
  if (!payload || payload.tag !== REPID_PLATFORM_TAG) return null;
  if (payload.chunks.length !== 2 || payload.chunks[1].length !== 32) return null;

  // El confirmador es la entidad que gasta su UTXO: se recupera su pkh a
  // partir del scriptSig P2PKH del primer input.
  const platformPkh = extractPkhFromUnlocking(decodedTx.inputs[0]?.unlockingBytecode);
  if (!platformPkh) return null;

  const receiptTxid = binToHex(payload.chunks[1]);
  return {
    type: 'PLATFORM_CONFIRMATION',
    txid,
    platformPkh,
    receiptTxid,
    valid: Boolean(lookupReceipt(receiptTxid)),
  };
}

// TRUST_LINK (SPEC-006, TASK-018): una identidad A declara, on-chain y
// unilateralmente (sin consentimiento de B), que confía en B. A gasta un
// UTXO P2PKH propio con OP_RETURN: <tag REPID_TRUST1> <pkh de B, 20 bytes>.
// No acuña Rating Rights; es un hecho declarativo. Si A == B (autoconfianza),
// el hecho se reconoce pero se marca `valid: false`.
function tryDecodeTrustLink(decodedTx, txid) {
  const opReturnOut = decodedTx.outputs.find((o) => o.lockingBytecode[0] === OP_RETURN);
  if (!opReturnOut) return null;

  const payload = parseOpReturn(opReturnOut.lockingBytecode);
  if (!payload || payload.tag !== REPID_TRUST_TAG) return null;
  if (payload.chunks.length !== 2 || payload.chunks[1].length !== 20) return null;

  const trusterPkh = extractPkhFromUnlocking(decodedTx.inputs[0]?.unlockingBytecode);
  if (!trusterPkh) return null;

  const trustedPkh = binToHex(payload.chunks[1]);
  return {
    type: 'TRUST_LINK',
    txid,
    trusterPkh,
    trustedPkh,
    valid: trustedPkh !== trusterPkh,
  };
}

// Decodifica manualmente el script OP_RETURN (sin volver a pasar por la
// VM): OP_RETURN <push tag> <push …>. Devuelve el tag y los chunks
// genéricos; el reconocedor de cada fact interpreta su forma.
function parseOpReturn(lockingBytecode) {
  let offset = 1; // saltar OP_RETURN
  const chunks = [];
  while (offset < lockingBytecode.length) {
    const len = lockingBytecode[offset];
    offset += 1;
    if (len === 0 || len > 75) return null; // solo direct-pushes simples
    chunks.push(lockingBytecode.slice(offset, offset + len));
    offset += len;
  }
  if (chunks.length < 2) return null;
  const tag = new TextDecoder().decode(chunks[0]);
  return { tag, chunks };
}

// Extrae el pkh del firmante de un scriptSig P2PKH estándar
// (<lenSig> <sig> <0x21> <pubkey 33B>). Devuelve hex o null.
function extractPkhFromUnlocking(unlockingBytecode) {
  if (!unlockingBytecode || unlockingBytecode.length < 35) return null;
  const last = unlockingBytecode.length;
  if (unlockingBytecode[last - 34] !== 0x21) return null; // push de pubkey comprimida
  const publicKey = unlockingBytecode.slice(last - 33, last);
  return binToHex(hash160(publicKey));
}

// --- Punto de entrada --------------------------------------------------

/**
 * Indexa una transacción cruda de RepID.
 *
 * @param {string} rawTxHex - hex de la transacción (como la retorna
 *   TransactionBuilder.send().hex o provider.getRawTransaction).
 * @param {{
 *   getRatingRight: (outpoint: string) => ({ownerPkh: string, ratesPkh: string} | undefined),
 *   trackRatingRight: (outpoint: string, info: {ownerPkh: string, ratesPkh: string}) => void,
 *   getReceipt: (txid: string) => unknown,
 *   trackReceipt: (txid: string, info: object) => void,
 * }} store - índice de outpoints de Rating Rights aún no gastados y de
 *   txids de Receipts ya acuñados. Ver createMemoryStore() / createJsonFileStore().
 * @returns el hecho reconocido, o null si la transacción no calza con
 *   ninguna forma conocida de RepID.
 */
export function indexRawTransaction(rawTxHex, store) {
  const bin = hexToBinLocal(rawTxHex);
  const decoded = decodeTransactionBCH(bin);
  if (typeof decoded === 'string') {
    throw new Error(`No se pudo decodificar la transacción: ${decoded}`);
  }

  // Derivamos el txid del propio hex: es lo que permite construir los
  // outpoints ("txid:vout") de las Rating Rights minteadas, para que
  // ISSUED_RATING pueda encontrarlas más tarde por su outpoint gastado.
  const txid = hashTransaction(bin);

  const identity = tryDecodeIdentityGenesis(decoded, txid);
  if (identity) return identity;

  const receipt = tryDecodeReceiptGenesis(decoded, txid);
  if (receipt) {
    for (const rr of receipt.ratingRights) store.trackRatingRight(rr.outpoint, rr);
    store.trackReceipt(txid, { receiptOwnerPkh: receipt.receiptOwnerPkh });
    return receipt;
  }

  const rating = tryDecodeIssuedRating(decoded, txid, store.getRatingRight);
  if (rating) return rating;

  const confirmation = tryDecodePlatformConfirmation(decoded, txid, store.getReceipt);
  if (confirmation) return confirmation;

  const trust = tryDecodeTrustLink(decoded, txid);
  if (trust) return trust;

  return null;
}

function hexToBinLocal(hex) {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

export function createMemoryStore() {
  const ratingRights = new Map();
  const receipts = new Map();
  return {
    trackRatingRight(outpoint, info) {
      ratingRights.set(outpoint, info);
    },
    getRatingRight(outpoint) {
      return ratingRights.get(outpoint);
    },
    trackReceipt(txid, info) {
      receipts.set(txid, info);
    },
    getReceipt(txid) {
      return receipts.get(txid);
    },
    // Vista del estado interno (TASK-020: panel "Vista Indexer" del demo).
    snapshot() {
      return {
        ratingRights: [...ratingRights.entries()],
        receipts: [...receipts.entries()],
      };
    },
  };
}

// Variante persistente del store (TASK-004 / Opción A): guarda el estado
// de Rating Rights (y el índice de Receipts, TASK-016) en un archivo JSON
// local y lo recarga al arrancar. Al ser persistente de una transacción a
// la siguiente, sobrevive reinicios del proceso — lo mínimo necesario para
// la trazabilidad de "quién ya calificó" y de "qué Recibos existen".
// Producción real merece una DB (SQLite u otra); esa decisión queda fuera
// de alcance del MVP (ver plan.md §5).
//
// @param filePath - ruta del archivo JSON donde se persiste el estado.
export function createJsonFileStore(filePath) {
  const ratingRights = new Map();
  const receipts = new Map();

  function load() {
    let raw;
    try {
      raw = readFileSync(filePath, 'utf8');
    } catch (err) {
      // Archivo inexistente => primer arranque, arrancamos limpios.
      // Cualquier otro error (permisos, directorio inválido, etc.) es
      // un fallo real y no debe ocultarse.
      if (err.code !== 'ENOENT') throw err;
      return;
    }
    const data = JSON.parse(raw);
    const stored = data && data.ratingRights ? data.ratingRights : {};
    for (const [outpoint, info] of Object.entries(stored)) {
      ratingRights.set(outpoint, info);
    }
    const storedReceipts = data && data.receipts ? data.receipts : {};
    for (const [txid, info] of Object.entries(storedReceipts)) {
      receipts.set(txid, info);
    }
  }

  function save() {
    const data = {
      ratingRights: Object.fromEntries(ratingRights),
      receipts: Object.fromEntries(receipts),
    };
    writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  load();

  return {
    trackRatingRight(outpoint, info) {
      ratingRights.set(outpoint, info);
      save();
    },
    getRatingRight(outpoint) {
      return ratingRights.get(outpoint);
    },
    trackReceipt(txid, info) {
      receipts.set(txid, info);
      save();
    },
    getReceipt(txid) {
      return receipts.get(txid);
    },
    // Útil para forzar una escritura en un momento controlado (o en tests).
    save,
    // Vista del estado interno (TASK-020: panel "Vista Indexer" del demo).
    snapshot() {
      return {
        ratingRights: [...ratingRights.entries()],
        receipts: [...receipts.entries()],
      };
    },
  };
}
