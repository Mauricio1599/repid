# SPEC-005: Protocolo del Indexer (RFC-006)

## 1. Contexto y Objetivo

El Indexer es la capa de interpretación de RepID: reconstruye hechos estructurados (facts) a partir del hex crudo de transacciones BCH y los expone en formato legible para aplicaciones y personas. La blockchain almacena hechos inmutables; el Indexer los interpreta **fuera de la cadena** (`constitution.md`, Artículo 1). No ejecuta la VM de Bitcoin ni valida firmas: reconoce hechos por la *forma* de la transacción (patrón de outputs, tags de `OP_RETURN`, seguimiento de estado).

El protocolo define qué se reconoce como hecho, cómo se valida cada hecho, y cómo el índice mantiene el estado que la cadena por sí sola no conserva (por ejemplo, qué Rating Rights siguen vivas y qué Recibos existen).

## 2. Historias de Usuario

- Como observador del ecosistema, quiero ver hechos de identidad, interacción, calificación y confirmación de plataforma en formato estructurado y verificable, en lugar de transacciones hex crudas.
- Como consumidor del protocolo, quiero distinguir sin ambigüedad un hecho válido de uno inválido, y saber cuándo una transacción simplemente no es un hecho de RepID.
- Como operador del Indexer, quiero que el estado de seguimiento sobreviva reinicios del proceso, para no perder la trazabilidad de "quién ya calificó".

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe reconstruir hechos estructurados (facts) a partir del hex crudo de transacciones, sin ejecutar la VM de Bitcoin ni depender de la validación de firmas.
- **RF-02** (Eventos): Cuando se mintea una identidad (un único output con NFT inmutable, commitment vacío, bloqueado a P2PKH), el sistema debe reconocer un hecho `IDENTITY_GENESIS` con su categoría y el pkh del propietario.
- **RF-03** (Eventos): Cuando se mintea un Recibo junto con dos Rating Rights (3 outputs de la misma categoría, commitment vacío en el primero), el sistema debe reconocer un hecho `RECEIPT_GENESIS` y registrar los dos outpoints de Rating Rights y el txid del Recibo para seguimiento posterior.
- **RF-04** (Eventos): Cuando una Rating Right rastreada se gasta con un `OP_RETURN` del tag `REPID_RATING1`, el sistema debe reconocer un hecho `RATING_ISSUED` identificando al calificador (`raterPkh`), al calificado (`rateePkh`) y el score.
- **RF-05** (Comportamiento No Deseado): Si el score está fuera del rango 1–5, entonces el sistema debe marcar el hecho como inválido (reconocerlo pero no ignorarlo silenciosamente).
- **RF-06** (Eventos): Cuando una entidad validadora gaste un UTXO P2PKH propio con un `OP_RETURN` del tag `REPID_PLATFORM1` y una referencia a un txid de Recibo, el sistema debe reconocer un hecho `PLATFORM_CONFIRMATION` con el pkh del confirmador y el txid referenciado.
- **RF-07** (Comportamiento No Deseado): Si una confirmación de plataforma referencia un Recibo que no está indexado, entonces el sistema debe marcar el hecho como inválido.
- **RF-08** (Ubicuidad): El sistema debe persistir el estado del índice (outpoints de Rating Rights vivos y txids de Receipts indexados) de modo que sobreviva reinicios del proceso.
- **RF-09** (Comportamiento No Deseado): Si una transacción no calza con ninguna forma conocida de RepID, entonces el sistema no debe emitir ningún hecho (sin inventar interpretaciones).
- **RF-10** (Eventos): Cuando una identidad A gaste un UTXO P2PKH propio con un `OP_RETURN` del tag `REPID_TRUST1` y el pkh de B (20 bytes), el sistema debe reconocer un hecho `TRUST_LINK` con `trusterPkh` = A y `trustedPkh` = B; si A y B son el mismo pkh, debe marcar el hecho como inválido (SPEC-006 RF-02/RF-03).

## 4. Requisitos No Funcionales

- Reconocimiento determinista: una misma transacción siempre produce el mismo hecho (o ninguno).
- Cero ejecución: el Indexer decodifica y clasifica por forma; la validez criptográfica de la transacción es responsabilidad de la cadena, no del Indexer.
- Agnóstico de orden de aparición donde sea posible: la confirmación de plataforma solo se valida contra Recibos ya indexados (RF-07), así que el orden importa; se documenta como restricción deliberada en lugar de ocultarse.
- Persistencia mínima del prototipo: archivo JSON local (plan.md §5). **Producción usará una base de datos real (ej. SQLite/Postgres) en un ciclo posterior — dirección confirmada** (Sección A de `tasks.md`, TASK-028, 2026-09-10).

## 5. Casos Límite y Restricciones

**Decisiones de diseño confirmadas** (Sección A / TASK-008 / TASK-016):
- Los hechos inválidos se REPORTAN con `valid: false` en lugar de ignorarse: la transacción es real en la cadena, y silenciarla ocultaría actividad maliciosa o defectuosa.
- `PLATFORM_CONFIRMATION` valida contra el índice de Receipts, no contra una lista blanca: si el Recibo referenciado nunca fue indexado, el hecho es inválido (RF-07).
- Tags de protocolo (`REPID_RATING1`, `REPID_PLATFORM1`): distinguen los `OP_RETURN` de RepID de cualquier otro uso en la misma cadena. El valor no tiene compromiso criptográfico; es una convención.

**Hallazgos del tooling que NO deben redescubrirse** (memoria operativa, plan.md §3 y agents.md §7):
- Las transacciones de génesis de CashTokens exigen que el outpoint gastado tenga `vout == 0`.
- `tokenCategory` dentro de un covenant devuelve los bytes en orden de visualización invertido.
- `outpointTransactionHash` del decoder ya viene en orden de visualización y NO se invierte (caso opuesto al anterior).
- `addOpReturnOutput` trata los strings como UTF-8 salvo que estén prefijados con `"0x"`.
- `MockNetworkProvider.sendRawTransaction` no ejecuta la VM ni valida firmas: un envío exitoso no prueba la corrección del script.
- `debug()` rechaza transacciones con Unlocker personalizado antes de evaluarlas: las pruebas de "impostor" con P2PKH quedaron inconclusas y NO se reclaman como cobertura.

**Caso límite deliberado:** un gasto de Rating Right *sin* `OP_RETURN` de RepID no se reconoce como hecho; el outpoint permanece "vivo" en el índice. El Indexer reconoce formas completas, no gastos parciales. Soportar ese caso requeriría rastrear gastos sin paylaod **y queda fuera de alcance: límite confirmado como decisión explícita del MVP** (Sección A de `tasks.md`, TASK-028, 2026-09-10).

## 6. Fuera de Alcance

- Ejecución o validación de la VM de Bitcoin (el Indexer decodifica y clasifica; no re-valida consenso).
- Cálculos de reputación agregada (promedios, ponderaciones, score compuesto) — la capa de interpretación de reputación es otra capa, posterior.
- Detección de gastos de Rating Right sin `OP_RETURN` (ver caso límite deliberado).
- Base de datos de producción (el JSON es la persistencia del prototipo; plan.md §5 difiere la decisión a producción).
- Indexación de tokens o NFTs ajenos a RepID.
- Cálculo del "vínculo pkh → Identidad" (RFC-001): la resolución entre pkh y categoría de identidad es off-chain y queda en una capa posterior.

## 7. Criterios de Aceptación (Definition of Done)

- [x] Los cuatro hechos reconocidos cubiertos por tests reales: `IDENTITY_GENESIS` (6), `RECEIPT_GENESIS` (8 + setup de rating/confirmación), `RATING_ISSUED` y `PLATFORM_CONFIRMATION` (RFC-004 + TASK-016).
- [x] `valid: false` para score fuera de rango 1–5 (RF-05; TASK-008), para confirmaciones de Recibos desconocidos (RF-07; TASK-016) y para autoconfianza (RF-10; TASK-018).
- [x] `null` para transacciones ajenas a RepID (RF-09, test "devuelve null…").
- [x] Persistencia JSON de Rating Rights y del índice de Receipts con recarga en instancia nueva (RF-08; TASK-004/TASK-016).
- [x] Suite completa en verde: `npx vitest run` → 68 tests, 0 fallos (7 archivos: 48 del protocolo/servidor + 20 E2E del servidor).
- [ ] El código cumple con `constitution.md`.