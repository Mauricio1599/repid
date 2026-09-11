import { describe, it, expect } from 'vitest';
import {
  validateInteraction,
  buildInteraction,
  toReceiptParts,
} from '../interaction/repid-interaction.mjs';

// pkh sintéticos (40 hex, válidos estructuralmente)
const PKH_A = 'a1'.repeat(20);
const PKH_B = 'b2'.repeat(20);

describe('SPEC-002 RF-04 — validación de roles explícitos', () => {
  it('acepta una interacción válida con roles en ambas partes', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'pasajero' },
      partyB: { pkh: PKH_B, role: 'conductor' },
    });
    expect(result.ok).toBe(true);
  });

  it('rechaza si partyA no tiene rol', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: '' },
      partyB: { pkh: PKH_B, role: 'conductor' },
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza si partyB no tiene rol', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'pasajero' },
      partyB: { pkh: PKH_B, role: '   ' },
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza si falta el pkh de alguna parte', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'pasajero' },
      partyB: { role: 'conductor' },
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza si ambas partes son la misma', () => {
    const result = validateInteraction({
      partyA: { pkh: PKH_A, role: 'pasajero' },
      partyB: { pkh: PKH_A, role: 'conductor' },
    });
    expect(result.ok).toBe(false);
  });

  it('rechaza si el objeto o alguna parte es nulo', () => {
    expect(validateInteraction(null).ok).toBe(false);
    expect(validateInteraction({ partyA: null, partyB: null }).ok).toBe(false);
  });
});

describe('SPEC-002 RF-03 — generación de metadatos para el Recibo', () => {
  it('genera una Interacción con roles y pkhs normalizados', () => {
    const interaction = buildInteraction({
      protocolRef: 'ride-1234',
      partyA: { pkh: `0x${PKH_A.toUpperCase()}`, role: '  pasajero  ' },
      partyB: { pkh: PKH_B, role: 'conductor' },
    });

    expect(interaction.partyA.pkh).toBe(PKH_A);
    expect(interaction.partyB.pkh).toBe(PKH_B);
    expect(interaction.partyA.role).toBe('pasajero'); // trim
    expect(interaction.protocolRef).toBe('ride-1234');
    expect(interaction.createdAt).toBeTruthy();
  });

  it('deriva los inputs del covenant en el orden esperado (RFC-003)', () => {
    const interaction = buildInteraction({
      partyA: { pkh: PKH_A, role: 'pasajero' },
      partyB: { pkh: PKH_B, role: 'conductor' },
    });
    expect(toReceiptParts(interaction)).toEqual({
      partyAPkh: PKH_A,
      partyBPkh: PKH_B,
    });
  });

  it('lanza error si se intenta construir con datos inválidos', () => {
    expect(() =>
      buildInteraction({ partyA: { pkh: PKH_A, role: '' }, partyB: { pkh: PKH_B, role: 'x' } }),
    ).toThrow(/rol/);
  });
});
