# SPEC-006: Protocolo de Confianza (Trust Link)

## 1. Contexto y Objetivo

Una identidad nueva, sin interacciones ni calificaciones, no tiene reputación: es el problema de *cold start*. El **Trust Link** permite que una identidad declare, on-chain, que confía en otra: un respaldo directo persona→persona que no requiere el consentimiento de la parte confiada ni una interacción previa.

Es un hecho de **declaración social unilateral**, distinto del par interacción+calificación (bilateral): aquí no hay Recibo, no hay Rating Rights, y no se habilita calificar al confiado. El indexer lo registra como un hecho más, y las capas de reputación fuera de la cadena (futuras) lo podrán usar para apuntalar la reputación inicial de identidades nuevas.

## 2. Historias de Usuario

- Como identidad establecida, quiero declarar abiertamente que confío en otra identidad, para dar señal de reputación a otros antes de que existan interacciones.
- Como observador del protocolo, quiero distinguir sin ambigüedad una declaración de confianza (unilateral, declarativa) de una interacción confirmada (bilateral, con calificación).

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe representar una declaración de confianza como un hecho on-chain independiente, unilateral, sin requerir el consentimiento de la parte confiada.
- **RF-02** (Eventos): Cuando una identidad A gaste un UTXO P2PKH propio con un `OP_RETURN` del tag `REPID_TRUST1` y el pkh de B, el sistema debe reconocer un hecho `TRUST_LINK` con `trusterPkh` = A y `trustedPkh` = B.
- **RF-03** (Comportamiento No Deseado): Si A y B son el mismo pkh (autoconfianza), entonces el sistema debe marcar el hecho como inválido.
- **RF-04** (Ubicuidad): La declaración no debe generar Rating Rights ni habilitar calificación por sí misma: es un hecho declarativo, sin deuda de interacción.

## 4. Requisitos No Funcionales

- Reconocimiento determinista y por forma, igual que el resto del Indexer: sin ejecutar la VM, sin validación de firmas.
- El vínculo es **unidireccional**: si B quiere confiar en A, debe emitir su propia declaración; no hay reciprocidad automática.
- Límite anti-spam conocido y aceptado en el MVP: cualquier identidad puede emitir tantas declaraciones como fees quiera pagar. El protocolo registra el hecho; las políticas anti-sybil y de ponderación quedan en la capa de reputación (fuera de alcance).

## 5. Casos Límite y Restricciones

**Decisión de diseño confirmada** (Sección E, TASK-018): el Trust Link es una **declaración unilateral A→B** — A gasta su UTXO y firma; B no firma ni lo sabe.

- El pkh de A se recupera del scriptSig P2PKH del primer input (mismo patrón que `PLATFORM_CONFIRMATION`, SPEC-003 RF-06). El segundo chunk del `OP_RETURN` debe tener exactamente 20 bytes (un pkh); cualquier otra longitud → la transacción no se reconoce.
- Si `trustedPkh === trusterPkh` el hecho se reconoce pero se marca `valid: false` (no se ignora en silencio; patrón de SPEC-005).
- La declaración puede referir a cualquier pkh, tenga o no Identidad: el vínculo pkh → Identidad (RFC-001) se resuelve off-chain (Constitución, Artículo 1). Validar mínimamente la identidad del truster es una mejora posible a futuro, no del MVP. **Decisión confirmada** (Sección A de `tasks.md`, TASK-028, 2026-09-10): se mantiene el comportamiento actual — cualquier pkh puede emitir Trust Links; las políticas anti-sybil y de ponderación quedan en la capa de reputación (post-MVP).
- `addOpReturnOutput` trata strings como UTF-8 salvo el prefijo `"0x"` (ver agents.md §7): el pkh de B debe codificarse como bytes.

## 6. Fuera de Alcance

- Gráfico de confianza y algoritmos de reputación (PageTrust, pesos, propagación) — capa de interpretación off-chain posterior.
- Revocación de una declaración de confianza (gasto posterior que la anule) — futura iteración.
- Políticas anti-sybil, umbrales de reputación mínima del truster, o ponderación por contexto.
- Validación de que el truster posea Identidad en el propio Indexer.

## 7. Criterios de Aceptación (Definition of Done)

- [x] `TRUST_LINK` reconocido por el Indexer (RF-02; TASK-018).
- [x] Autoconfianza marcada `valid: false` (RF-03; TASK-018).
- [x] `OP_RETURN` con tag ajeno a RepID → no se reconoce (test en TASK-018).
- [x] El hecho no acuña Rating Rights: la transacción del test no los incluye (RF-04).
- [x] Suite completa en verde: `npx vitest run` → 66 tests, 0 fallos (7 archivos, incluye los 18 E2E del servidor).
- [ ] El código cumple con `constitution.md`.