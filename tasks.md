# tasks.md — RepID

> Regla de los 20-30 minutos: cada tarea debe ser auditable de una sentada. Ninguna tarea se marca como hecha sin que su RF correspondiente esté validado con un test real (Constitución, Artículo 7).

---

## Sección A — Confirmación de Asunciones de Diseño
*(decisiones de Mauricio, no requieren código — hacer estas primero, condicionan a la Sección B)*

- [x] **TASK-001** [SPEC-003 / RF-03] Decisión confirmada: `ReceiptGenesisValidator` **queda fijo en 2 partes**. Interacciones grupales se modelan como múltiples Receipts pairwise (uno por par). La extensión a N partes queda fuera de alcance. Caso "plataforma confirmadora" (C) → attestation separada (tarea futura), no extensión del covenant. *— 20 min*
- [x] **TASK-002** [SPEC-003 / RF-04] Decisión confirmada: el bloqueo del Recibo a `partyA` **pasa a ser regla impuesta por el covenant** (enforcement on-chain). Ya está implementado en `receipt_genesis.cash:53`; se actualizará la spec (RFC-003) en TASK-010 para reflejar que deja de ser mera convención. — *20 min*
- [x] **TASK-003** [SPEC-004 / RF-05] Decisión confirmada: el commitment del Rating Right **usa el pkh** del propietario (opción actual), no la categoría completa del Identity NFT. El vínculo pkh → Identidad se resuelve en capa superior (off-chain). Se reflejará en RFC-004 (TASK-010). — *30 min*
- [x] **TASK-004** [plan.md §5] Decisión confirmada: persistencia del Indexer para el prototipo = **archivo JSON local** (cargar el store al arrancar, re-escribir tras cada tx indexada). Producción real queda diferida a una DB (SQLite u otra), fuera de alcance del MVP. — *30 min*

## Sección B — Implementación Pendiente

- [x] **TASK-005** [SPEC-002 / RF-01, RF-02] Formalizar el modelo de datos de "Interacción" (partyA, partyB, roles) en `plan.md` §2. — *30 min*

> ✅ Cerrado junto con TASK-006/007. Modelo de interacción formalizado en `plan.md §2`, módulo `interaction/repid-interaction.mjs`, 9 tests nuevos en `test/interaction.test.js`. Ejecutado y verificado: `npx vitest run` → 28 tests pasando.

- [x] **TASK-006** [SPEC-002 / RF-04] Implementar validación de roles explícitos al definir una interacción (rechazo si falta rol). — *30 min*
- [x] **TASK-007** [SPEC-002 / RF-03] Implementar generación de metadatos de interacción listos para alimentar la génesis del Recibo (RFC-003). — *30 min*
- [x] **TASK-008** [SPEC-004 / RF-04] Agregar validación explícita de rango de score (1–5) con test dedicado que cubra valores fuera de rango. — *20 min*

> Implementado en `indexer/repid-indexer.mjs` (`tryDecodeIssuedRating`): el score fuera de rango (1-5) se reconoce pero se marca `valid: false` (la transacción se considera inválida, no se ignora). Test dedicado cubre 0, 6, 200. Ejecutado → 29 tests pasando.
- [x] **TASK-009** [SPEC-001, SPEC-003, SPEC-004] Aplicar las decisiones tomadas en la Sección A a los contratos y al Indexer correspondientes (una tarea por asunción confirmada). — *30 min c/u*

> Verificado: contratos ya cumplen TASK-001 (fijo a 2 partes, `receipt_genesis.cash:48`), TASK-002 (Recibo locked a partyA, `:53`) y TASK-003 (commitments con pkhs, `:57,:62`) — sin cambios de código.
>
> Implementado en el Indexer: `createJsonFileStore(filePath)` persiste Rating Rights en JSON local (TASK-004, Opción A), carga al arrancar (ignora `ENOENT`), re-escribe tras cada registro. Tests agregados en `test/issued_rating_and_indexer.test.js` (3 tests de persistencia). Ejecutado → 32 tests pasando.

## Sección C — Documentación (Spec Anchored)

- [x] **TASK-010** Actualizar RFC-003 y RFC-004 reflejando las decisiones tomadas en la Sección A. — *20 min*

> SPEC-003 actualizada: RF-04 pasa de "Opción/convención" a regla del covenant; sección 5 con decisiones confirmadas (TASK-001/002); fuera de alcance actualizado (attestation separada para plataforma).
>
> SPEC-004 actualizada: asunción de sección 5 confirmada (commitment con pkh, TASK-003); RF-04 con test marcado como hecho (TASK-008).
>
> SPEC-002 actualizada (Spec Anchored, Art. 10): marcada como implementada, asunción de 2 partes resuelta, criterios de aceptación completados.
- [x] **TASK-011** Sincronizar el diagrama de arquitectura SVG existente con cualquier cambio resultante de TASK-009. — *30 min*

> Diagrama actualizado: el Receipt pasa de "bloqueado a P2PKH de A (convención)" a "(regla de covenant)" (TASK-002); el Indexer incorpora la línea "store persistente: Rating Rights en archivo JSON" (TASK-009).
- [x] **TASK-012** Revisar que `agents.md` siga reflejando el estado real de implementación (tabla de la sección 1) después de cerrar la Sección B. — *20 min*

> `agents.md` actualizado: RFC-002 → ✅ (9 tests), RFC-004 → ✅ (rango 1–5), RFC-006 → ✅ (score validation + persistencia JSON), RFC-005 señalado con capa de interacción + persistencia. Sección 2 agrega la capa de Interacción y el `createJsonFileStore`. Total: 32 tests.
- [ ] **TASK-012b** Re-establecer el patrón "Layla upgrade loop" mencionado en sesiones previas (se perdió en un reset de entorno). Confirmar con Mauricio qué cubría exactamente antes de intentar reconstruirlo. — *20 min*

> ⛔ **BLOQUEADA — pendiente de información original.** Mauricio no conserva el contenido del patrón y no existe fuente en el repo. Conforme a la Constitución (Art. 4), **no se reconstruye de memoria**: reconstruirlo a ciegas produciría un artefacto inventado. Queda abierta para una sesión futura; el punto de anclaje natural es `plan.md` §6 (upgrade Layla de BCH) y `AGENTS.md` §9.

## Sección D — Testing y QA de Cierre

- [x] **TASK-013** Ejecutar el Checklist de Verificación de Calidad Final completo (ver sección siguiente) antes de considerar cerrado cualquier ciclo de la Sección B. — *20 min*

> Checklist ejecutado: Constitución ✅ (sin cambios de covenant no aprobados; Art. 2, 9 respetados), Cobertura RF ✅ (6+9+8+9 = 32 tests), Auditoría ✅ por TASK-014, Trazabilidad ✅ (cada tarea apunta a su RF), Cierre de Intención ✅ (resultados = decisiones de Sección A).

- [x] **TASK-014** Auditoría manual de "no alucinación": verificar a mano, corriendo los comandos reales, que ningún resultado de test reportado como pasando fue en realidad inventado. — *20 min*

> Doble verificación ejecutada en esta sesión: (1) `npx vitest run` real → 4 archivos, 32 tests pasando, 0 fallos; (2) conteo estático de bloques `it(` por archivo: identity 6 + interaction 9 + issued_rating_and_indexer 9 + receipt 8 = 32. Ambas fuentes coinciden sin discrepancia. Los tests nuevos (roles, metadatos, rango 1–5, persistencia) aparecen por nombre en la salida — no fueron inventados.

---

## Checklist de Verificación de Calidad Final (por ciclo)

- [x] **Validación de Constitución:** ¿el código respeta la Ley Suprema (`constitution.md`)? — ✅ Verificado: sin modificaciones de covenant no aprobadas (Art. 9 respetado: TASK-009 aprobada en Plan antes de implementar); soluciones simples (Art. 2); interpretación off-chain sin lógica ON-chain (Art. 1); honestidad radical sobre TASK-012b y limitaciones del tooling (Art. 4).
- [x] **Cobertura RF:** ¿todos los Requisitos Funcionales EARS de la(s) spec(s) tocada(s) están cubiertos por código y test? — ✅ 32 tests reales cubren SPEC-001 (6), SPEC-002 (9), SPEC-003 (8), SPEC-004 + RFC-006 (9). Cada RF de las specs tocadas en este ciclo tiene test: roles (RF-04 SPEC-002), metadatos (RF-03 SPEC-002), rango 1–5 (RF-04 SPEC-004), persistencia (plan §5).
- [x] **Auditoría de Alucinación:** ¿se verificó manualmente que la IA no "inventó" la finalización de una tarea? — ✅ Ejecutado `npx vitest run` real (4 archivos, 32 tests, 0 fallos); los tests nuevos aparecen por nombre en la salida.
- [x] **Trazabilidad:** ¿cada tarea marcada como hecha en `tasks.md` apunta a su RF correspondiente? — ✅ Las 14 tareas `[x]` referencian su RF/spec (SPEC-002/003/004, plan §5); las de documentación/QA (011–014) son autorreferentes por su naturaleza; TASK-012b permanece bloqueada, sin marcar.
- [x] **Cierre de Intención:** ¿el resultado refleja la intención original documentada en la `spec.md`? — ✅ Resultados = decisiones confirmadas de la Sección A (2 partes, regla de covenant, commitment pkh, persistencia JSON) aplicadas y reflejadas en specs (TASK-010), diagrama (011) y agents.md (012).

**Responsabilidad final:** la IA aporta velocidad; Mauricio aporta el criterio y es el responsable último de la calidad y el éxito del sistema.

---

## Sección E — Integraciones post-cierre (luego del primer ciclo)

- [x] **TASK-015** [RFC-005 / SPEC-002] Integrar la capa de Interacción (roles explícitos) al servidor demo y conectar la persistencia JSON. — *30 min*

> Implementado y verificado con corrida real:
> - `server/index.js`: `/api/interactions` ahora valida con `validateInteraction` y deriva `partyAPkh`/`partyBPkh` con `buildInteraction` + `toReceiptParts` (roles requeridos). El store del Indexer pasa de `createMemoryStore` a `createJsonFileStore` (`data/indexer-store.json`).
> - `server/public/`: agregados campos "Rol de A" y "Rol de B" (index.html) y envío de `{ partyA: {pkh, role}, partyB: {pkh, role} }` (app.js).
> - Smoke test HTTP real en puerto 3901: wallet → identity → interacción con roles (`pasajero`+`conductor`) → rating score=5 → 3 facts indexados; rol vacío en A y en B → 400. Persistencia verificada en disco. `npx vitest run` → 32 tests pasando.

- [x] **TASK-016** [SPEC-003 RF-06] Implementar `PLATFORM_CONFIRMATION` (patrón C): confirmación de interacción por una validadora (plataforma) como hecho independiente on-chain. — *45 min*

> Implementado y verificado:
> - **Spec**: SPEC-003 incorpora RF-06 y SACAR la attestation de plataforma de "fuera de alcance" (Art. 6: la spec va primero).
> - **Indexer**: nuevo tag `REPID_PLATFORM1`; reconocedor `tryDecodePlatformConfirmation` (gasto P2PKH + `OP_RETURN` con txid del Recibo; el pkh de la plataforma se recupera del scriptSig del input, la plataforma NO mintea Identidad). Validación contra índice de Receipts: referencia a Recibo desconocido → `valid: false` (no se ignora en silencio). El store (`memory` y `jsonFileStore`) ahora rastrea y persiste txids de Receipts.
> - **Tests**: +4 en `test/platform_confirmation.test.js` (confirmación válida, receipt desconocido → invalid, tag ajeno → null, persistencia del índice de Receipts). Suite 32 → **36 tests pasando** (`npx vitest run`).
> - **Servidor demo**: `POST /api/platform-confirmations` + panel "Confirmar interacción" en la UI (RFC-005). Verificación HTTP real: wallet plataforma confirma el Recibo → fact `PLATFORM_CONFIRMATION` `valid:true` → ledger `IDENTITY_GENESIS → RECEIPT_GENESIS → PLATFORM_CONFIRMATION`; 404 para Recibo inexistente; persistencia de `receipts` en `data/indexer-store.json`.

- [x] **TASK-017** [RFC-006] Formalizar el protocolo del Indexer como spec (SPEC-005, formato SDD/EARS). — *30 min*

> Redactada `specs/SPEC-005-indexer-protocol.md`: 9 RFs EARS (reconocimiento de los 4 hechos `IDENTITY_GENESIS`, `RECEIPT_GENESIS`, `RATING_ISSUED`, `PLATFORM_CONFIRMATION`; marcado `valid:false`; persistencia; `null` para transacciones ajenas), historias de usuario, no funcionales, casos límite (decisiones confirmadas + los hallazgos de tooling de agents.md §7, para no rediscovering) y criterios de aceptación con la suite actual (36 tests). Actualizadas las referencias cruzadas: `plan.md` (cubre SPEC-001 a SPEC-005) y `agents.md` (RFC-006 → SPEC-005). Pendiente revisión de Mauricio del texto.

- [x] **TASK-018** [SPEC-006] Implementar el **Trust Link** (link de confianza persona→persona): declaración unilateral A→B, on-chain. — *50 min*

> Estrategia aprobada por Mauricio en la sección E: declaración unilateral (A gasta UTXO propio con `OP_RETURN`; B no firma ni consiente).
> - **Spec**: `specs/SPEC-006-trust-protocol.md` (format SDD/EARS) + RF-10 en SPEC-005.
> - **Indexer**: tag `REPID_TRUST1` + reconocedor `tryDecodeTrustLink` (chunk de 20 bytes = pkh de B; pkh de A del scriptSig). Hecho `{ type, txid, trusterPkh, trustedPkh, valid }`. Autoconfianza (A==B) → `valid:false` (RF-03). No acuña Rating Rights (RF-04).
> - **Tests**: +3 en `test/trust_link.test.js` (unilateral A→B, autoconfianza inválida, tag/payload ajeno → null). Suite 36 → **39 tests pasando** (`npx vitest run`, 6 archivos).
> - **Servidor demo**: `POST /api/trust-links` + panel "Declarar confianza" en la UI. Verificación HTTP real: `TRUST_LINK` válido (A→B), autoconfianza → `valid:false`, pkh malformado → 400; 2 hechos en el ledger. Suite + smoke sin dejar procesos colgados.

- [x] **TASK-019** [RFC-005] Hacer el prototipo **testeable de forma formal y manual**: servidor cubierto por tests E2E + guía de pruebas para no-programadores. — *60 min*

> Estrategia (aprobada por Mauricio en la sección E): opción A — acomodar el prototipo para que (1) quede testeable de forma automática end-to-end y (2) pueda probarse a mano, paso a paso, sin conocimientos de programación.
> - **Server**: `server/index.js` — mensaje de arranque claro ("Abrí la interfaz en tu navegador: http://localhost:PORT") + env `REPID_DATA_DIR` para aislar persistencia (lo usa la suite E2E) + `POST /api/reset` (demo-only: reinicia wallets, hechos, cadena mock y archivo de persistencia).
> - **Tests**: `test/e2e_server.test.js` — levanta el proceso REAL (`spawn node server/index.js`) en puerto efímero y persistencia temporal; flujo feliz completo (wallets → identidad → interacción con roles → calificación → confirmación de plataforma → trust link → 5 tipos en el ledger) + errores (identidad duplicada 409, rol vacío 400, score fuera de rango 400, Rating Right ya usada 409, Recibo inexistente 404, pkh malformado 400, autoconfianza `valid:false`) + reset. `package.json` gana script `"test:e2e"`.
> - **UI**: toasts verdes de éxito en cada acción + panel "Reiniciar demo" (conviven con el toast rojo de errores).
> - **Guía**: nueva `GUIA_DE_PRUEBAS.md` — arranque en 3 pasos, pantalla de un vistazo, 11 pruebas paso a paso en tablas "Qué hacés → Resultado esperado" (incluye errores deliberados), glosario del Ledger y limitaciones honestas.
> - **Verificación**: suite completa `npx vitest run` → **52 tests / 7 archivos pasando** (39 previos + 13 E2E); corrida guiada real sobre el servidor (`node scripts/guide_smoke.mjs`) → 13/13 PASS incluyendo reset; sin procesos colgados en puertos de test.

- [x] **TASK-020** [RFC-006 / RFC-005] **Vista Indexer** en el prototipo: sub-interfaz que muestra el lado técnico hoy oculto (cómo "oye" y procesa la red cada transacción). — *50 min*

> Estrategia aprobada por Mauricio en la sección E (Art. 9): agregar `snapshot()` al store del Indexer y dos endpoints demo-only. Preguntas resueltas: mostrar feed + estado interno (no solo uno), e incluir simulación de transacción ajena descartada.
> - **Indexer** (`repid-indexer.mjs`): nuevo método `snapshot()` en `createMemoryStore` y `createJsonFileStore` → `{ ratingRights, receipts }` (aditivo, no toca el reconocimiento).
> - **Server** (`server/index.js`): feed del nodo `rawTransactions` + helper `recordFromChain(hex, txid)` (las 5 acciones ahora registran el hex crudo junto al hecho); `GET /api/indexer-view` (feed + stores + archivo persistencia) y `POST /api/foreign-tx` (demo: gasta un UTXO P2PKH con un `OP_RETURN` de tag ajeno `HELLO1` → el indexer la marca `factType: null`, el Ledger no cambia). Reset también limpia el feed.
> - **UI**: la columna derecha pasa a tener pestañas **[Ledger] | [Vista indexer]** (toggle clicable); la vista indexer muestra feed del nodo (badge Reconocida/Descartada, txid, bytes y **hex colapsable**), Rating Rights bajo seguimiento, Receipts indexados y archivo de persistencia; botón "Enviar transacción desconocida" con toast verde.
> - **Tests**: `test/e2e_server.test.js` 13 → **15** (vista indexer expone feed + estado; transacción desconocida se descarta sin tocar el ledger; reset vacía feed y stores). Suite 52 → **54 tests / 7 archivos pasando** (`npx vitest run`).
> - **Guía**: `GUIA_DE_PRUEBAS.md` suma Pruebas 12–14 (ver hex, transacción desconocida descartada, reinicio completo).
> - **Verificación**: guide_smoke ampliado a **19/19 PASS** sobre el servidor real (incluye indexer-view, foreign-tx y reset); sin procesos node colgados (el `npm start` en 3787 lo levantó el usuario).

- [x] **TASK-021** [RFC-005 / RFC-006] **Reputación visible + Demo automática**: la interpretación off-chain que corona el protocolo (auditable hecho por hecho) y el sistema vivo en 1 clic. — *60 min*

> Estrategia aprobada por Mauricio en la sección E (público: técnicos/colaboradores): el perfil debe ser auditable, no solo mostrar números.
> - **Server**: refactor de los 5 handlers de API a helpers reutilizables (`mintIdentity`, `createInteraction`, `platformConfirm`, `issueRating`, `createTrustLink`) que ejecutan blockchain + indexación; los handlers mantienen la validación de entrada y delegan (los 18 tests E2E anteriores + nuevos verifican que no hubo regresión).
>   - `GET /api/reputation/:pkh` (400 si pkh malformado): deriva de los `facts` indexados — `hasIdentity` + txid, `ratingsReceived[{score, raterPkh, txid}]`, `avg` (1 decimal, null sin datos), `distribution {1..5}`, `ratingsIssued`, `trustReceived` (solo valid), `confirmedReceipts`. Sin ponderación ni juicio (capa de reputación fuera de alcance, SPEC-006).
>   - `POST /api/demo/run` (demo-only): reutiliza las helpers para poblar 3 wallets + 1 identidad + **2 interacciones** (A↔B y B→A, para que ambos perfiles tengan datos) + **2 calificaciones** (A→B=5, B→A=4) + 1 confirmación + 1 trust. Devuelve resumen; no resetea (convive con datos previos).
> - **UI**: tercera pestaña **[Reputación]** (select wallet + «Ver perfil» → promedio, distribución con barras, identidad, y listados auditables con txids + nota "sin ponderar"); panel **«Demo automática»** con botón «Reproducir demo» y toast con el resumen.
> - **Tests**: `test/e2e_server.test.js` 15 → **18** (perfil auditable con datos conocidos del flujo: B avg 5.0 / A identity + confirmedReceipts; demo/run tras reset con conteos exactos 1/2/2/1/1; demo convive con datos previos; pkh malformado → 400). Suite total → **57 tests / 7 archivos** (`npx vitest run`).
> - **Guía**: `GUIA_DE_PRUEBAS.md` suma Pruebas 15–16 (demo automática; auditar cada promedio hasta su transacción) + actualiza "pantalla de un vistazo".
> - **Verificación**: suite completa 57 tests en verde; smoke de guía ampliado a deptos real (demo/run + reputation sobre server real); `node --check` OK; sin procesos colgados (el `npm start` en 3787 sigue siendo del usuario).

- [x] **TASK-022** [RFC-005] **Spike de conectividad Chipnet**: verificar que la red es alcanzable y evaluable desde este entorno antes de tocar covenants. — *40 min*

> **Objetivo cumplido**: Chipnet está **viva y sincronizada** (altura ~322,878 el 2026-09-09; upgrade **May 2026 / CashVM ya activo** desde bloque 279,792 — misma semántica que mainnet). `chipnet.imaginary.cash` (WSS, puerto 50004 default) responde: `getBlockHeight`, `getUtxos`, `estimatefee` (~1 sat/byte: `0.00001` BCH/kB). Las direcciones `bchtest:` que ya genera el server son válidas en Chipnet.
>
> **⚠️ Hallazgo C1 (bloquea arquitectura):** el stack `@electrum-cash/network` (tanto `ElectrumNetworkProvider` de CashScript como `ElectrumClient` directo) **congela el event loop del proceso completo, de forma intermitente, al segundo request sobre una conexión persistente** — el proceso no responde ni siquiera a timers/`Promise.race`; hay que matarlo. Reproducido en 6+ corridas aisladas; un probe con una sola operación por proceso siempre funciona.
>
> **⚠️ Hallazgo C2:** el default de CashScript para Chipnet (`chipnet.bch.ninja`) **no responde desde este entorno** (timeout limpio). Host efectivo: `chipnet.imaginary.cash` (hostname simple, sin puerto — este lib arma `wss://host:50004` y rompe la URL si se le pasa `host:puerto`).
>
> **Consecuencia en el diseño**: el modo Chipnet **no** puede correr requests de red dentro del proceso Express. TASK-023 implementó la capa **`context/network-processor`** que ejecuta cada operación de red en un *child process* aislado. Los 57 tests sobre Mock quedan intactos.

- [x] **TASK-023** [RFC-005] **Modo dual `REPID_NETWORK=mock|chipnet` + capa de red en child process**: el servidor elige red por env (mock por defecto); Chipnet virtualiza cada op (`height`, `fee`, `utxos`, `broadcast`, `rawtx`) hacia un worker aislado **con kill + reintento (2)** ante cuelgue intermitente (C1).

> **Implementado con verificación real:**
> - **`context/network-processor.mjs`**: child process de una sola operación; contrato stdio JSON `{"ok":true,"result":...}|{"ok":false,"error":...}` (satoshis/amount viajan como string). Ojo de API: en la versión instalada de `@bitauth/libauth`, `cashAddressToLockingBytecode(addr, true)` devuelve **`{ bytecode, prefix, tokenSupport }`** (no los bytes directos) — descubierto al aislar el bug.
> - **`server/chipnet-provider.mjs`**: provider CashScript que delega al worker (interfaz `Network.CHIPNET`, `getUtxos` normaliza `token.amount` a BigInt); timeout 25s + SIGKILL; fee real (~1 sat/byte) cachead por 60s.
> - **`server/index.js`**: factory `REPID_NETWORK`; gastos P2PKH (rating, platform, trust, foreign) refactorizados a una helper `spendP2pkh` con `addBchChangeOutputIfNeeded({to: wallet.address, feeRate})` (fee real con cambio a la wallet). En Mock los E2E originales no cambiaron de comportamiento (57 tests verdes intactos).
> - **Gates honestos**: génesis de Identidad y Recibo en Chipnet → **501 "TASK-024"** (el covenant actual exige 1/3 outputs; enviar 2/4 sería rechazado por la VM real); `demo/run` en Chipnet → **501 "TASK-025"**. `reset` no llama `provider.reset()` en Chipnet (no existe).
> - **Chipnet**: en `createWallet()` no se inyecta UTXO sintético; errores 409 sin fondos citan el faucet `tbch.googol.cash` y la dirección a fondear.
> - **Verificación**: smoke real `scripts/chipnet-mode-smoke.mjs` (server en modo chipnet contra la red viva): wallets OK, `foreign-tx` sin fondos → 409 con pista de faucet, génesis y demo → 501 correctos. Suite completa 57/57 en verde (mock immutable). `node --check` OK en los 3 archivos.
>
> **Queda para TASK-024** (aprobado): covenants con output de change (identity 1→2, receipt 3→4) + funding real (vout 0) para habilitar las génesis en Chipnet; **TASK-025**: funding UX, persistencia de claves, badge mempool/confir; **TASK-026**: E2E Chipnet con tBCH real + guía.

- [x] **TASK-024** [RFC-001/003/004] **Covenants con output de cambio + génesis reales**: habilita la génesis en la red real (Chipnet) sin regalar el funding en fees, y que la VM real la acepte. *(Estrategia aprobada por Mauricio en modo Plan: modificar covenants.)*

> **Implementado con verificación real:**
> - **`contracts/identity_genesis.cash`**: 1 → **2 outputs** (NFT + change P2PKH al propietario). El change no puede portar tokens **minteados en la misma transacción** (`tokenCategory != newCategory`) — semántica elegida tras comprobar que `tokenCategory == bytes32(0)` no se satisface en la VM con outputs sin token (CashScript no expone "no token" como ceros comparables).
> - **`contracts/receipt_genesis.cash`**: 3 → **4 outputs** (Receipt + 2 Rating Rights + change P2PKH a `partyA`, quien financia). Misma regla anti-minteo-oculto en el change.
> - **`server/index.js`** (helper `createGenesisFunding`): en Chipnet construye una **transacción de funding real 1-input/1-output** que deja todo el saldo en el contrato (outpoint resultante `vout 0`, condición del covenant); en Mock se inyecta el UTXO directo como antes. Las génesis agregan el cambio con `addBchChangeOutputIfNeeded` (fee real ~1 sat/byte, cached 60s). Gates 501 eliminados: en Chipnet sin tBCH responden **409** con pista de faucet + dirección.
> - **`indexer/repid-indexer.mjs`**: `outputs.length` 1/2 (identity) y 3/4 (receipt); un output extra con token NO es el cambio esperado → no reconocer. Compatible retro: reconoce tanto la génesis con change como sin él.
> - **Specs**: SPEC-001 +RF-06 (cambio owner), SPEC-003 +RF-07 (cambio partyA) + DoD.
> - **Tests**: 57 → **63** (8+2 tests de covenant con change en identity/receipt: fuga de valor, change con token, 3–4 outputs; 2 tests indexer con génesis con change). `npx vitest run`: **63/63 en verde** / 7 archivos.
> - **Verificación real**: smoke `scripts/chipnet-mode-smoke.mjs` — en Chipnet, génesis identity sin tBCH → 409 faucet (no 501). Bug encontrado y corregido: `createGenesisFunding` recibía `pkh` en bytes (no `pkhHex`) → localStorage/requireWallet fallaba; arreglado pasando `pkhHex`.
>
> **Queda para TASK-025**: funding UX (dirección a fondear + verificar fondos), persistencia de claves, badge mempool/confirmada; **TASK-026**: E2E Chipnet (tBCH real, valida que la VM real acepte las génesis) + guía.

- [x] **TASK-025** [RFC-005] **Funding UX + persistencia de claves + badge mempool/confirmada**: cierra el ciclo "fundá y seguí" en Chipnet.

> **Implementado con verificación real:**
> - **Persistencia (Chipnet, aislada por `REPID_DATA_DIR`)**: las wallets de prueba se guardan en `data/wallet.json` (`binToHex` de claves → recargadas al arranque con `loadWalletsFromDisk`); el estado local del prototipo (facts, feed, identidades, interacciones, Rating Rights disponibles) en `data/repid-state.json` (`persistState`/`loadStateFromDisk`) para no volver a mintear algo que ya está on-chain. En Mock nada cambia (todo en memoria). `reset` en Chipnet borra ambos archivos. *Advertencia documentada: son claves de prueba tBCH, no producción.*
> - **Worker**: nueva op `status {txid}` → `blockchain.transaction.get_status` → `{ confirmed, blockHeight }` (mempool vs confirmada).
> - **API**: `GET /api/status` (red actual); `GET /api/wallets/:pkh` (saldo on-chain en sats, address, `hasIdentity`); `GET /api/tx/:txid/status` (mock: confirmada al instante; chipnet: worker).
> - **demo/run en Chipnet**: gate 501 eliminado → corre igual que en mock, con chequeo previo: si ninguna wallet tiene fondos, **409** con pista del faucet.
> - **UI** (`server/public/`): badge de red en el masthead, botón «Saldo» por wallet (muestra sats + dirección completa para fondear en Chipnet), y badge de estado por transacción en la Vista indexer (confirmada/bloque o en mempool).
> - **Verificación real**: suite **63/63** + E2E **18/18** + smoke `scripts/chipnet-mode-smoke.mjs` **9/9 PASS** — incluye reinicio del proceso en Chipnet con wallets persistidas recargadas y op `status` respondiendo desde el worker.
>
> **Queda para TASK-026**: E2E Chipnet con tBCH real (valida que la VM real acepte las génesis) + guía.

- [x] **TASK-026** [RFC-005] **E2E Chipnet con tBCH real + guía**: validar frente a la VM real de Bitcoin (Chipnet) que las génesis y el flujo completo son aceptados on-chain. *(Corrida real ejecutada: 2026-09-10.)*

> **Avanzado y verificado sin fondos:**
> - **`scripts/chipnet-e2e.mjs`**: server aislado en modo chipnet (`REPID_DATA_DIR=data_chipnet_e2e`, puerto 3789) que crea una wallet, consulta su saldo on-chain y ejecuta `demo/run` (identidad + 2 interacciones + 2 calificaciones + confirmación + trust). Verifica que **cada tx que produjo un hecho existe en la red** (rawtx descargado del worker: `GET /api/tx/:txid/raw`, endpoint nuevo) y muestra el estado mempool/confirmada de cada una, más la reputación construida desde los hechos. Sin fondos termina **limpio con código 2**, mostrando la dirección exacta a fondear y **preservando la wallet persistida** para reintentar.
> - **`GUIA_DE_PRUEBAS.md` §7**: guía en lenguaje humano del modo real: manera automática (comando + faucet manual `tbch.googol.cash`) y manera manual por la interfaz (badge «Red real Chipnet», botón Saldo, badge mempool/confirmada, explorador de bloques).
> - **Endpoint** `GET /api/tx/:txid/raw` (Chipnet: hex crudo desde el worker; Mock: null).
>
> **Corrida real ejecutada y registrada (2026-09-10, Chipnet · tBCH):**
> - Wallet fondeada por Mauricio: `bchtest:zqw3mjll4fe0py3c905hye2rv52wn5k6vcpt8ppdc7` — saldo consultado on-chain: **1.015.000 sats**.
> - Nueva base de `demo/run` en Chipnet: la wallet fondeada **financia la demo** vía transferencias P2PKH→P2PKH (`POST /api/transfer` + helper `transferSats`, 20k sats a cada una de las 3 wallets que la demo crea; sin OP_RETURN → el indexer las ignora, no son hechos).
> - **Resultado: 11/11 PASS** — 7 hechos broadcast reales y verificables on-chain:
>   - `ac8027090206…` · IDENTITY_GENESIS
>   - `c5d7a5cc872e…` · RECEIPT_GENESIS
>   - `ff93deae71ff…` · RECEIPT_GENESIS
>   - `7a91a0bb42a3…` · RATING_ISSUED
>   - `cb9810086869…` · RATING_ISSUED
>   - `d632d9abae70…` · PLATFORM_CONFIRMATION
>   - `782783ee7feb…` · TRUST_LINK
>   - Todas descargadas (rawtx del worker) desde la red; en mempool al momento de la corrida; reputación construida desde hechos reales: **avg=5.0 (1 calificación)**.
>
> **Corrida de archivo con txids COMPLETOS (2026-09-10, Chipnet · tBCH):**
> > Se repitió el E2E con una segunda gota del faucet (wallet nueva persistida `bchtest:zpf4zlclrvwglwtygjr6qzy02skuj079eygsvsajnx`, saldo 1.015.000 sats on-chain) una vez aplicada la corrección de retención de persistencia. **Resultado: 11/11 PASS**, todos los txids completos asentados (7 hechos, en mempool al cierre de la corrida):
> > - `b3465406476c6bbb31f04a160093ac025d401f795ee3f5d838c600bbab004fd7` · IDENTITY_GENESIS
> > - `038b1c64e25bec342bd8677b7739135f1db389a208e3e1d5e17481727257726e` · RECEIPT_GENESIS
> > - `6728f5f6d51923abf468fa12ef8e84089531d6f522d36b47ec86f0ef9ba34cb0` · RECEIPT_GENESIS
> > - `4ab26ebf1c4d4ffb4d1a4cbacc7bd702c4ef15fe3e62816df8da0146f77acd87` · RATING_ISSUED
> > - `35dcd6c666ea1ef43205790a90fb1b8d87dd467dbd7ebb5af0a2cffd110d05b9` · RATING_ISSUED
> > - `50c65e71641350059c5905eff975e2220bc37fbafe1f7dfc77cb1b38d4152d97` · PLATFORM_CONFIRMATION
> > - `5170e3a9cdcde7dda83dd9b2161dcd75c083c4597877177c314125fc158fb22a` · TRUST_LINK
> > - Reputación reconstruida desde hechos reales: **avg=5.0**. Persistencia de la corrida conservada en `data_chipnet_e2e/`.
>
> **Hallazgo del ciclo (corrección aplicada)**: la primera versión del E2E **borraba su `data_chipnet_e2e` al terminar con éxito** — eso perdió las claves de las wallets de la corrida (los hechos quedan on-chain, pero sin las claves no se puede volver a gastar). El script ahora **conserva la persistencia** para re-verificación (limpieza manual a cargo del operador). También se corrigió el arranque limpio: si no hay wallets persistidas, el E2E crea una y muestra la dirección a fondear (exit 2), en vez de fallar.
>
> **Estado**: validación de protocolo frente a la VM real **cerrada y doblemente asentada** (corridas del 2026-09-10: la inicial con prefijos y la de archivo con txids completos). Para cruzar on-chain: `https://chipnet.imaginary.cash/explorer`.

- [x] **TASK-027** [RFC-005] **Paquete de presentación para colaboradores/financiamiento**: hace "presentable" el prototipo ya validado.

> **Implementado con verificación real:**
> - **`README.md`** nuevo (raíz): presentación pública del proyecto (tagline inglés + cuerpo en español) — qué es, las 6 specs, estado (63 tests, Mock + Chipnet), arquitectura en una página, cómo arrancar en ambos modos, tests, estructura del repo y notas honestas. El README anterior de insumos SDD quedó preservado en `docs/PACKAGE-SDD.md`.
> - **`docs/PITCH.md`**: pitch de una página (problema → idea → por qué BCH/CashTokens → estado → qué se busca) para financiamiento.
> - **`diagram/repid-architecture.svg`**: actualizado al protocolo vigente — Receipt Genesis con **4 outputs** (incluye el cambio a A por fees), y dos hechos nuevos on-chain: **Platform Confirmation** (SPEC-003/RF-06, flecha desde el Recibo) y **Trust Link** (SPEC-006). Leyenda y pie ajustados. XML validado.
> - **`AGENTS.md`**: nota del conteo definitivo (63) junto al estado de RFCs.
> - **Verificación**: suite completa **63/63** intacta (no se tocó código de protocolo; solo documentación y diagrama, validado como XML bien formado).

- [x] **TASK-028** [todas] **Cierre de asunciones abiertas de las specs (marco MVP vs post-MVP)**: inventario y decisión de las asunciones restantes, asentado en cada `SPEC-00X`. *(Decidido con Mauricio el 2026-09-10.)*

> **Resultado — 5 decisiones (todas con las recomendaciones; lenguaje funcional):**
> 1. **Pérdida de clave de Identidad** (SPEC-001): **riesgo aceptado en el MVP**. El NFT es inmutable y no hay recuperación on-chain; una clave perdida = identidad perdida. Se documenta y se recomienda respaldo off-chain (custodia de la clave). Revocación/re-emisión queda como mejora futura, no programada.
> 2. **Gasto de Rating Right sin OP_RETURN** (SPEC-005): **límite MVP confirmado como decisión explícita**. Ese gasto deja el utxo "vivo" en el índice y no emite hecho; rastrear gastos sin payload queda fuera de alcance.
> 3. **Persistencia del indexer en producción** (SPEC-005): **dirección confirmada = DB real (SQLite/Postgres) en un ciclo futuro**; el JSON queda como persistencia del prototipo.
> 4. **Cancelación/disputa de una interacción antes del Recibo** (SPEC-002): **aplazada conscientemente al post-MVP**. No bloquea el MVP: sin acuerdo, la aplicación simplemente no emite el Recibo.
> 5. **Trust Links sin Identidad del truster** (SPEC-006): **se mantiene el MVP actual** — cualquier pkh puede declarar confianza; anti-sybil y ponderación quedan en la capa de reputación (post-MVP).
>
> **Notas:**
> - Quedó abierta una sola mejora *no programada* (revocación de identidad), anotada en SPEC-001 §6.
> - **Verificación**: suite completa **63/63** (cambios solo de documentación; políticas de código sin tocar). Con esto, **no quedan asunciones abiertas sin marco** en las specs.

- [x] **TASK-029** [RFC-005] **Robustez del servidor**: tests E2E directos para los endpoints agregados en TASK-025/026 y endurecimiento del contrato de `POST /api/transfer`. *(Ejecutado 2026-09-10.)*

> **Implementado:**
> - **`POST /api/transfer` — validación estricta del amount** en `server/index.js`: ahora exige un entero ≥ 1 que además respete el mínimo de polvo de la red (**546 sats**, antes un amount menor caía en 500 por dust de cashscript); `0`, negativos, no numéricos, vacíos y < 546 → **400** con mensaje claro; wallet inexistente (from/to) → **404**.
> - **Tests E2E nuevos** en `test/e2e_server.test.js`:
>   - Transfer P2PKH→P2PKH feliz: 201, txid 64-hex, amount reflejado como string, y **verifica que NO genera un hecho RepID** (la cantidad de facts no cambia — refuerza el caso límite de SPEC-005: las transferencias sin OP_RETURN no son hechos).
>   - Errores: amount `0`, `-1`, `abc`, `1.5`, vacío y `100` → 400; wallets inexistentes → 404.
>   - Endpoints TASK-025/026 según modo: `GET /api/status` → `{network:'mock'}`; `GET /api/tx/:txid/raw` → `{hex:null}`; `GET /api/tx/:txid/status` → `{confirmed:true, blockHeight:null}`; `GET /api/wallets/:pkh` inexistente → 404.
>
> **Verificación**: suite completa **66/66** (antes 63) + smoke chipnet **9/9** PASS intacto.

> **Opcional (no bloquea, depende de la gota)**: extender `scripts/chipnet-mode-smoke.mjs` con una transfer real P2PKH→P2PKH (verificando on-chain que no genera hecho) cuando la wallet de la corrida tenga tBCH.

- [x] **TASK-030** **Repo público + CI (GitHub)**: el prototipo pasa de carpeta local a repositorio versionado y con integración continua. *(Ejecutado 2026-09-11.)*

> **Implementado:**
> - `.gitignore` en la raíz (excluye `node_modules/`, `data/`, `data_chipnet_e2e/` — protege claves/wallets de prueba tBCH).
> - `LICENSE` MIT (decisión de Mauricio) + `CONTRIBUTING.md`.
> - `package-lock.json` versionado (`npm ci` reproducible en CI) + workflow `.github/workflows/ci.yml` (Node 22 → `npm ci` → `npm test`).
> - `git init -b main` (user `Mauricio1599` / `mauricioramos150699@gmail.com`), commit inicial y `gh repo create repid --public --source . --push`.
> - **Repo**: https://github.com/Mauricio1599/repid — badge del CI en el README.
>
> **Verificación**: primer run de Actions en `main` → **success** (run 34558659475 y el de la badge 34558672872, ambos verdes).

- [x] **TASK-031** [RFC-005] **Pestaña «App de ejemplo» (freelance)** en la consola web: una mini-plataforma de freelance montada sobre la **API existente** (sin cambios de backend) que muestra RepID como capa de reputación usable desde una app. *(Ejecutado 2026-09-11.)*

> **Implementado:**
> - Nueva pestaña **«App ejemplo»** en `server/public/index.html` + `app.js` + `style.css`:
>   1. **Contratar al profesional** — `POST /api/interactions` con roles `cliente`/`profesional` (Recibo on-chain); el selector de tarea (diseño de logo / servidor / traducción) es metadato de la interacción.
>   2. **La plataforma confirma** — `POST /api/platform-confirmations` (hecho `PLATFORM_CONFIRMATION` con una wallet validadora).
>   3. **El cliente califica** — el cliente gasta su Rating Right con `POST /api/ratings` (score 1–5, slider).
>   4. **Reputación del profesional** — `GET /api/reputation/:pkh` en vivo + declara confianza opcional (`POST /api/trust-links`).
> - Historial de la sesión de la app (recibo, confirmada/calificada) y panel **«Crudo»** que muestra la llamada exacta a la API (método, ruta, payload y respuesta) por acción.
> - `renderReputation` reutilizable con target de card (la pestaña app muestra el perfil del profesional en su propia card).
> - **Test E2E nuevo** `la App de ejemplo (freelance) mueve el flujo completo sobre la API` en `test/e2e_server.test.js` (cliente/profesional/plataforma frescos → interacción → confirmación → rating → reputaciones cruzadas del profesional y del cliente).
>
> **Verificación**: suite completa **67/67** PASS + CI verde.
>
> **Nota**: el `confirmedReceipts` de la reputación pertenece al perfil del **cliente** (partyA es el dueño del Recibo), no al del profesional — el test lo verifica con perfiles cruzados.

- [x] **TASK-032** [RFC-005] **E2E Chipnet en GitHub Actions (workflow manual)**: la validación frente a la VM real de Bitcoin queda publicada y reproducible en el repo público. *(Ejecutado 2026-09-11.)*

> **Implementado:**
> - Nuevo `.github/workflows/chipnet-e2e.yml` (`workflow_dispatch`, manual a propósito: el faucet `tbch.googol.cash` es captcha manual): checkout → Node 22 + `npm ci` → recupera el artifact `data_chipnet_e2e` de una corrida anterior (reintentar sin perder tBCH) → `REPID_NETWORK=chipnet REPID_DATA_DIR=... node scripts/chipnet-e2e.mjs` → sube el artifact con las wallets de prueba (`if: always()`).
> - Sin fondos, el script corta con código 2 tras mostrar la dirección a fondear (igual que local); el artifact queda guardado para la reintentada.
>
> **Verificación**: run real (34560157789) en GitHub — wallet creada en Chipnet (`bchtest:zpu3kqx9du5hnv…`), saldos consultados on-chain, y corte controlado con **exit code 2** y dirección a fondear. Comportamiento esperado: validar el cableado integro (server chipnet → provider → worker → script). Con tBCH en el artifact, un reintento corre el flujo completo 11/11 PASS.
