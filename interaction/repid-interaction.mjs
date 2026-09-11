// RFC-002 — Interaction Protocol (capa off-chain)
//
// Define el modelo de metadatos de una Interacción entre dos partes
// (partyA, partyB) a nivel de aplicación, ANTES de que exista un Recibo
// on-chain (RFC-003). Opera fuera de la cadena (Constitución, Artículo 1):
// solo el Recibo resultante se ancla on-chain.
//
// Este módulo NO toca covenants ni la lógica del Indexer. Es la capa de
// metadatos que una aplicación externa usa para describir una interacción
// y derivar los inputs (partyAPkh, partyBPkh) del ReceiptGenesisValidator.

import { utf8ToBin, binToHex } from '@bitauth/libauth';

// Normaliza un pkh recibido como hex (con o sin '0x') o como Uint8Array,
// devolviéndolo como hex sin '0x'. Devuelve null si no parece un pkh.
function normalizePkh(pkh) {
  if (pkh instanceof Uint8Array) return binToHex(pkh);
  if (typeof pkh !== 'string') return null;
  const clean = pkh.startsWith('0x') ? pkh.slice(2) : pkh;
  if (!/^[0-9a-fA-F]{40}$/.test(clean)) return null;
  return clean.toLowerCase();
}

// Valida un rol: debe ser un string no vacío (agnóstico de dominio).
// RepID lo transporta en los metadatos pero nunca lo interpreta.
function validateRole(role) {
  return typeof role === 'string' && role.trim().length > 0;
}

// --- TASK-006 / RF-04 ------------------------------------------------
// Rechaza la definición de una interacción si alguna parte carece de
// pkh o de rol explícito, o si ambas partes son la misma.
//
// @param input - DefineInteractionInput { partyA, partyB }
// @returns { ok: true, input } | { ok: false, error }
export function validateInteraction(input) {
  if (!input || typeof input !== 'object') {
    return { ok: false, error: 'Se requiere un objeto de interacción.' };
  }

  if (!input.partyA || !input.partyB) {
    return { ok: false, error: 'La interacción requiere exactamente dos partes (partyA y partyB).' };
  }

  const aPkh = normalizePkh(input.partyA.pkh);
  const bPkh = normalizePkh(input.partyB.pkh);

  if (!aPkh || !bPkh) return { ok: false, error: 'Cada parte debe especificar un pkh válido.' };
  if (aPkh === bPkh) return { ok: false, error: 'Las dos partes de una interacción no pueden ser la misma.' };

  if (!validateRole(input.partyA.role) || !validateRole(input.partyB.role)) {
    return { ok: false, error: 'Cada parte debe especificar un rol explícito (no vacío).' };
  }

  return { ok: true, input };
}

// --- TASK-007 / RF-03 ------------------------------------------------
// A partir de una interacción ya validada, genera los metadatos listos
// para alimentar la genésis del Recibo (RFC-003): el pkh de cada parte
// en el orden esperado por ReceiptGenesisValidator, más la copia
// normalizada de los roles para la capa de aplicación.
//
// @param input - DefineInteractionInput ya validado
// @returns Interation finalizada { protocolRef, partyA, partyB, createdAt }
export function buildInteraction(input) {
  const validated = validateInteraction(input);
  if (!validated.ok) throw new Error(validated.error);

  const original = validated.input;
  return {
    protocolRef: typeof original.protocolRef === 'string' ? original.protocolRef : undefined,
    partyA: {
      pkh: normalizePkh(original.partyA.pkh),
      role: original.partyA.role.trim(),
    },
    partyB: {
      pkh: normalizePkh(original.partyB.pkh),
      role: original.partyB.role.trim(),
    },
    createdAt: new Date().toISOString(),
  };
}

// Devuelve los inputs en el orden que espera el covenant del Recibo.
// Es el puente hacia RFC-003: partyAPkh y partyBPkh.
export function toReceiptParts(interaction) {
  return { partyAPkh: interaction.partyA.pkh, partyBPkh: interaction.partyB.pkh };
}

// Export de utilidad para los tests que necesiten un pkh sintético.
export const _internal = { normalizePkh, utf8ToBin };
