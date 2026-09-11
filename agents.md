# agents.md — RepID

> Este documento define el contexto operativo para cualquier agente de IA (Claude Code, Claude en Playground, u otro) que trabaje sobre RepID. Léelo completo antes de tocar código.

## 1. Resumen del Proyecto

RepID es un protocolo de reputación descentralizado construido sobre **Bitcoin Cash (BCH)**, usando **CashTokens** y **CashScript**.

**Principio arquitectónico central (no negociable):** la blockchain almacena hechos inmutables; la interpretación de esos hechos permanece fuera de la cadena (off-chain).

El proyecto está formalizado en 6 RFCs:

| RFC | Nombre | Estado |
|---|---|---|
| RFC-001 | Protocolo de Identidad | ✅ Implementado (6 tests) |
| RFC-002 | Protocolo de Interacción | ✅ Implementado (9 tests) |
| RFC-003 | Protocolo de Recibo de Interacción | ✅ Implementado (8 tests + RF-06 / `PLATFORM_CONFIRMATION`) |
| RFC-004 | Protocolo de Calificación RepID | ✅ Implementado (ISSUED_RATING + validación de rango 1–5) |
| RFC-005 | Implementación de Referencia BCH | ✅ Implementado (covenants base, capa de interacción, persistencia, confirmación de plataforma y trust integrados al servidor demo; **validado frente a la VM real de Bitcoin: corrió E2E en Chipnet 2026-09-10, 11/11 PASS** — ver `tasks.md` TASK-026). |
| RFC-006 | Especificación del Indexer | ✅ Implementado (RATING_ISSUED + PLATFORM_CONFIRMATION + TRUST_LINK; score 1–5 y confirmación validada contra índice de Receipts; persistencia JSON). Protocolo formalizado en SPEC-005 |

Suite completa: **66 tests pasando** (`npx vitest run`; 48 del protocolo/servidor + 18 E2E del servidor).
*(Nota: la operativa actual usa el conteo dinámico real; la última verificación es 66/66 tras TASK-029.)*

Objetivo inmediato: prototipo funcional sólido para atraer colaboradores o financiamiento. Desarrollo en solitario, horizonte de semanas.

## 2. Arquitectura (resumen funcional)

- **Identidad**: NFT inmutable bloqueado con P2PKH del propietario. Se acuña una sola vez vía `IdentityGenesisValidator` (covenant de un solo uso).
- **Interacción (RFC-002)**: capa off-chain de metadatos (`interaction/repid-interaction.mjs`) que define la interacción entre dos partes con rol explícito por cada una, y deriva los inputs (`partyAPkh`, `partyBPkh`) de la génesis del Recibo. Validación de roles incluida.
- **Recibo de Interacción**: NFT acuñado únicamente con firma conjunta de ambas partes, junto con dos UTXOs de **Rating Right** (uno por parte) en la misma transacción de génesis (`ReceiptGenesisValidator`). Actúa como capa anticorrupción entre protocolos de interacción específicos de cada app y RepID.
- **Calificación**: cada Rating Right es un UTXO de un solo uso. Al gastarse (P2PKH), incluye un `OP_RETURN` con el score (1–5) y el NFT se quema implícitamente — esto garantiza "una calificación por participante" sin lógica de covenant adicional.
- **Confirmación de plataforma (SPEC-003 RF-06, patrón C)**: una entidad validadora corrobora que una interacción ocurrió gastando un UTXO P2PKH propio (no necesita Identidad) con un `OP_RETURN` que referencia el txid del Recibo. Hecho independiente (`PLATFORM_CONFIRMATION`); el indexer lo valida contra su índice de Receipts.
- **Trust Link (SPEC-006)**: declaración unilateral de confianza persona→persona — A gasta su UTXO con `OP_RETURN` (pkh de B) sin consentimiento de B ni Rating Rights. Ataca el problema de cold start (reputación inicial). Autoconfianza (A==B) → marcada inválida.
- **Indexer**: reconstruye hechos estructurados desde el hex crudo de transacciones usando `decodeTransactionBCH` de libauth. Rastrea los outpoints de Rating Rights (necesario porque el NFT se quema al gastarse) y los txids de Receipts (para validar confirmaciones). La variante persistente `createJsonFileStore` guarda ese estado en un archivo JSON local (soporta reinicios del proceso).
- **Servidor prototipo**: Express + consola web de dos columnas para demostrar el flujo end-to-end. Mensaje de arranque con la URL, toasts de éxito/error, botón "Reiniciar demo" (`POST /api/reset`, demo-only) y env `REPID_DATA_DIR` para aislar persistencia. La columna derecha tiene tres pestañas: **Ledger** (interpretación), **Vista indexer** (feed de transacciones crudas con hex + estado interno del store + `POST /api/foreign-tx` para demostrar que lo no-RepID se descarta) y **Reputación** (`GET /api/reputation/:pkh`, interpretación off-chain: promedio sin ponderar + listados auditables con txid). Panel **"Demo automática"** (`POST /api/demo/run`, demo-only) que puebla el flujo completo reutilizando las mismas helpers que la API. En pruebas de guía manual: `GUIA_DE_PRUEBAS.md`.

- **E2E Chipnet (TASK-026, corrido real 2026-09-10, doble corrida)**: `scripts/chipnet-e2e.mjs` validó el flujo completo contra la red real (server aislado puerto 3789, `data_chipnet_e2e`, wallet fondeada con 1.015.000 sats de tBCH): **11/11 PASS**, 7 hechos broadcast reales + reputación avg=5.0. La primera corrida perdió los txids completos por un bug de borrado del data dir; la **corrida de archivo** (con la corrección de retención aplicada) asentó los 7 txids completos en `tasks.md` TASK-026. Sin fondos termina con código 2 mostrando la dirección a fondear (faucet manual `tbch.googol.cash`, captcha) y preserva la wallet para reintentar. La demo en Chipnet **financia sus propias wallets** desde la wallet fondeada vía `POST /api/transfer` (P2PKH→P2PKH sin OP_RETURN; no son hechos). `GET /api/tx/:txid/raw` baja el hex real desde el worker para verificar on-chain que la tx que produjo cada hecho existe. Guía en `GUIA_DE_PRUEBAS.md` §7. ⚠️ No borrar `data_chipnet_e2e` tras una corrida exitosa (perderías las claves tBCH de las wallets de prueba).
- **Modo dual (TASK-023)**: `REPID_NETWORK=mock` (default, red simulada, 66 tests intactos) o `REPID_NETWORK=chipnet` (red de pruebas real, tBCH). En modo chipnet **toda** operación de red va a un child process aislado (`context/network-processor.mjs`, una op por proceso, stdio JSON `{"ok":true,"result":...}|{"ok":false,"error":...}`) vía `server/chipnet-provider.mjs` — véase hallazgo C1. Ops: `height`, `fee`, `utxos`, `broadcast`, `rawtx`, `status` (mempool/confirmada). En chipnet las wallets nacen vacías y hay que fondearlas (faucet `tbch.googol.cash`); los gastos P2PKH usan fee real `addBchChangeOutputIfNeeded`. Las génesis (TASK-024) exigen **2** (identidad) o **4** (recibo) outputs — el cambio P2PKH vuelve al funder (`identity`: propietario; `receipt`: partyA) y las txs de funding real dejan todo el saldo en el contrato (outpoint vout 0). **Persistencia (TASK-025)**: en chipnet las wallets de prueba y el estado local del prototipo se guardan en `data/wallet.json` y `data/repid-state.json` (solo tBCH, claves de prueba — no producción; aislables con `REPID_DATA_DIR`); `demo/run` ya no está gateado con 501 — exige fondos tBCH y responde 409 con pista de faucet si no los hay.

## 3. Stack Técnico

- CashScript / **cashc 0.13.2**
- **libauth** (`decodeTransactionBCH`)
- **vitest** como test runner
- **MockNetworkProvider** para simulación local de transacciones
- **Express** para el servidor prototipo

## 4. Comandos de Referencia

- Compilar un contrato: `cashc contracts/<Nombre>.cash --output artifacts/<Nombre>.json`
- Correr todos los tests: `npx vitest run`
- Correr solo la suite E2E del servidor: `npm run test:e2e`
- Levantar el servidor prototipo: `npm start` (abre `http://localhost:3787`)

## 5. Convenciones

- **Idioma del código** (identificadores, nombres de contratos, comentarios técnicos): **inglés**. Ya es la convención establecida (`IdentityGenesisValidator`, `ISSUED_RATING`, `ReceiptGenesisValidator`).
- **Idioma de documentación y comunicación** (specs, RFCs, conversación con Mauricio): **español**.
- Todo Requisito Funcional (RF) definido en una `spec.md` debe tener un test real que lo respalde antes de considerarse completo.
- Ningún resultado de test se reporta como válido sin haberse ejecutado de verdad.

## 6. Límites del Agente (qué NO hacer)

- No modificar contratos CashScript ni la lógica del Indexer sin aprobar antes la estrategia en Modo Plan.
- No afirmar que un test pasa sin haberlo corrido.
- No omitir ni maquillar limitaciones conocidas del tooling (ver sección 7) — deben quedar documentadas explícitamente.
- No resolver unilateralmente ninguna de las asunciones abiertas marcadas en las specs (ver `spec.md` de cada RFC, sección "Casos Límite") sin confirmación explícita de Mauricio.
- `constitution.md` tiene prioridad jerárquica sobre cualquier `spec.md` en caso de conflicto.

## 7. Hallazgos Técnicos Clave (memoria operativa — no volver a redescubrir esto)

- Las transacciones de génesis de CashTokens requieren que el outpoint gastado tenga **`vout == 0`**; si no, `MockNetworkProvider` rechaza con un error de validación de tokens que no tiene nada que ver con la lógica del contrato — no perder tiempo debuggeando el covenant en ese caso.
- `tokenCategory` dentro de un covenant de CashScript devuelve los bytes en **orden de visualización invertido**.
- `outpointTransactionHash` del decoder de libauth **ya está en orden de visualización** y no debe invertirse (es el caso inverso al anterior — cuidado con confundirlos).
- `addOpReturnOutput` trata los strings como **UTF-8** salvo que estén prefijados con `"0x"`.
- `MockNetworkProvider.sendRawTransaction` **no ejecuta la VM de Bitcoin** ni valida firmas o scripts — un `sendRawTransaction` exitoso no es prueba de que el script sea correcto.
- **Chipnet (2026-09):** viva y sincronizada, CashVM activo (altura 279,792+). Electrum accesible vía `chipnet.imaginary.cash` (WSS 50004 default, hostname sin puerto). El default de CashScript (`chipnet.bch.ninja`) **no responde**; no pasar `host:puerto` (el lib arma la URL mal).
- **Chipnet C1 (crítico):** `@electrum-cash/network` puede **congelar el event loop del proceso completo** en requests sobre conexión persistente (el proceso no responde a timers; hay que matarlo). Por eso las operaciones de red reales SIEMPRE van en child process aislado (ver `context/network-processor.mjs`); nunca dentro del proceso Express.
- **Chipnet C2:** fee rate real ~1 sat/byte; las direcciones del server (prefix `bchtest`) son válidas; gotas del faucet `tbch.googol.cash` (manual, captcha).
- **libauth (versión instalada):** `cashAddressToLockingBytecode(address, tokenSupport)` devuelve **`{ bytecode, prefix, tokenSupport }`**, no los bytes directos — usar `result.bytecode` (descubierto al cablear el worker). Acepta addresses token-aware solo con `tokenSupport: true` (las del server empiezan por `z`).
- `debug()` rechaza transacciones que usan un Unlocker personalizado antes de evaluarlas — las pruebas de "impostor" con P2PKH quedan **inconclusas** con el tooling disponible actualmente; no reclamar cobertura de ese caso.
- **E2E Chipnet (corrida real)**: nunca borrar `data_chipnet_e2e` al terminar una corrida exitosa — las claves tBCH de las wallets de prueba viven ahí y los hechos quedan on-chain *sin* poder volver a gastarse si desaparecen. Si un script E2E limpia su `REPID_DATA_DIR`, que la limpieza sea manual y documentada.

## 8. Estado de Documentación

Este proyecto opera bajo el enfoque **Spec Anchored** (ver `constitution.md`, Artículo 10): las specs y el código deben mantenerse sincronizados en ambas direcciones.

- **Artefactos de presentación (TASK-027)**: `README.md` (raíz, presentación pública), `docs/PITCH.md` (pitch de una página), `diagram/repid-architecture.svg` (actualizado: 4 outputs del Recibo + Platform Confirmation + Trust Link). El README original de insumos SDD vive en `docs/PACKAGE-SDD.md`.
- Al editar specs, actualizar también `README.md` y el diagrama si cambian los hechos/protocolo representados.

## 9. Cómo Trabajar con Mauricio (arquitecto del proyecto)

- Mauricio se comunica en **español**. No es programador — tiene pensamiento arquitectónico/conceptual fuerte, pero no puede escribir ni auditar código él mismo. Explicá las cosas en términos funcionales, no en jerga de implementación, salvo que él lo pida.
- Mauricio trabaja de forma **iterativa**: propone una dirección arquitectónica, el agente evalúa e implementa, y ambos validan con compilación y tests reales — nunca con una descripción de que "debería funcionar".
- Cuando Mauricio escribe algo breve como **"sigue"**, significa: preferí avanzar de forma continua antes que detenerte a pedir aclaraciones. Igual no sacrifiques la Constitución (Modo Plan, tests reales) por velocidad.
- Si en algún momento se pierden archivos fuente (ej. por un reset de entorno o sandbox), el agente puede **reconstruir artefactos desde memoria arquitectónica**, pero debe marcar explícitamente qué es reconstrucción y qué son asunciones — nunca presentar una reconstrucción como si fuera el artefacto original verificado (ver `constitution.md`, Artículo 4).
- Existe un patrón mencionado en sesiones previas como **"Layla upgrade loop"** que se perdió en un reset de entorno. ⚠️ **No fue reconstruido** (TASK-012b bloqueada): Mauricio no conserva su contenido y no hay fuente en el repo. Conforme a la Constitución (Art. 4) no se re-crea de memoria para no inventar artefactos. Si reaparece una referencia, el ancla de recuperación es `plan.md` §6.

## 10. Qué NO está incluido en este paquete de insumos

Este paquete (`repid-sdd-insumos`) contiene **únicamente artefactos de planificación**. No contiene:

- El código fuente real de los contratos CashScript, el Indexer ni el servidor Express.
- Los tests automatizados reales (aunque `agents.md` y las `spec.md` documentan cuántos existen y qué cubren).
- El diagrama SVG de arquitectura ya producido en una sesión anterior.
- El texto completo original de los RFC-001 a RFC-006 (las `spec.md` y `plan.md` de este paquete son una traducción funcional de esos RFCs a formato SDD/EARS, no un reemplazo literal).

**Si el agente recibe únicamente este paquete y no el código real:** no debe asumir que el código ya existe en el entorno de trabajo. Debe preguntar explícitamente si el repo/código ya está disponible antes de empezar a "reimplementar" algo que, según este documento, ya fue construido y verificado — reimplementarlo a ciegas puede producir una versión distinta a la ya probada.
