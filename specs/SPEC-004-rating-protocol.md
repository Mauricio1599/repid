# SPEC-004: Protocolo de Calificación RepID

## 1. Contexto y Objetivo

Una vez emitido un Recibo de Interacción, cada parte posee un Rating Right: el derecho de calificar a la otra parte exactamente una vez. El protocolo aprovecha la semántica de gasto único de un UTXO para garantizar "una calificación por participante" sin necesidad de lógica de covenant adicional.

## 2. Historias de Usuario

- Como participante de una interacción, quiero calificar a la otra parte usando mi Rating Right, para dejar un hecho de reputación verificable en la cadena.
- Como observador del protocolo, quiero poder confiar en que nadie puede calificar dos veces por la misma interacción.

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe representar cada Derecho de Calificación (Rating Right) como un UTXO de un solo uso.
- **RF-02** (Eventos): Cuando el propietario de un Rating Right gaste el UTXO, el sistema debe incluir un payload `OP_RETURN` con la calificación (score entero entre 1 y 5).
- **RF-03** (Ubicuidad): El sistema debe quemar implícitamente el NFT del Rating Right al gastarse, garantizando que solo pueda emitirse una calificación por participante.
- **RF-04** (Comportamiento No Deseado): Si el score incluido en el `OP_RETURN` está fuera del rango 1–5, entonces el sistema debe considerar la transacción inválida.
- **RF-05** (Ubicuidad): El sistema debe registrar el commitment del Rating Right usando el pkh del propietario, en lugar de la categoría completa del NFT de Identidad.

## 4. Requisitos No Funcionales

- El gasto del Rating Right se implementa como un spend P2PKH estándar — no requiere covenant propio, lo cual simplifica la implementación (ver `constitution.md`, Artículo 2).
- El Indexer debe poder detectar el `OP_RETURN` y decodificar el score sin ambigüedad.

## 5. Casos Límite y Restricciones

**Decisión de diseño confirmada** (Sección A de `tasks.md`, TASK-003):
- RF-05: el commitment del Rating Right usa el pkh del propietario (no la categoría completa del Identity NFT). El vínculo pkh → Identidad (RFC-001) se resuelve en una capa posterior, off-chain (conforme al Artículo 1 de la Constitución).

- `addOpReturnOutput` trata los strings como UTF-8 salvo que estén prefijados con `"0x"` — riesgo de codificar el score incorrectamente si no se usa el prefijo.
- Un score fuera del rango 1–5 se reconoce pero se marca `valid: false` por el Indexer; no se ignora silenciosamente (RF-04, cubierto por test en TASK-008).

## 6. Fuera de Alcance

- Algoritmos de agregación de reputación on-chain (cálculo de score compuesto, promedios, ponderaciones).
- Disputas o impugnaciones de una calificación ya emitida.
- Calificaciones con texto libre o comentarios (solo se admite el score numérico 1–5 en esta fase).

## 7. Criterios de Aceptación (Definition of Done)

- [x] `ISSUED_RATING` implementado: spend P2PKH con `OP_RETURN` de score, burn implícito del NFT.
- [x] Validación explícita de rango de score (RF-04) cubierta por test (scores 0, 6 y 200 marcados inválidos; TASK-008).
- [x] Asunción de la sección 5 confirmada por Mauricio: commitment con pkh del propietario (TASK-003).
- [ ] El código cumple con `constitution.md`.
