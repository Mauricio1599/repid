# HANDOFF-NOTES.md — Qué más necesita la IA además de este paquete

Este paquete (`repid-sdd-insumos`) contiene **únicamente los artefactos de planificación SDD**: `agents.md`, `constitution.md`, las `spec.md`, `plan.md` y `tasks.md`. No contiene código fuente, no contiene tests reales, no contiene el diagrama.

Si le vas a dar esto a una IA como **único** insumo (sin acceso al repo real ni a esta conversación), leé esto antes.

## 1. Lo más importante: el código fuente real

Según lo que documentan `agents.md` y las `spec.md`, ya existen **4 piezas implementadas y verificadas con 19 tests pasando en total**:

- `IdentityGenesisValidator` (contrato CashScript) — 6 tests
- `ReceiptGenesisValidator` (contrato CashScript) — 8 tests
- Spend `ISSUED_RATING`
- Módulo Indexer (`decodeTransactionBCH` + `MemoryStore`) — 5 tests
- Servidor Express con consola de dos columnas

**Si tenés ese código guardado** (por ejemplo, el zip `repid-prototype.zip` de una sesión anterior, o un repo git), **adjuntalo junto con este paquete de insumos**. Sin el código real, cualquier agente que reciba solo estas specs tiene dos caminos, y los dos son riesgosos si no se lo advertís:
- Asumir que el código ya existe en el entorno y fallar al no encontrarlo, o
- Reimplementar todo desde cero "porque la spec lo pide", perdiendo el trabajo ya hecho y arriesgándose a producir una versión distinta a la ya probada.

Por eso `agents.md` (sección 10) ya le indica al agente que pregunte explícitamente antes de asumir cualquiera de las dos cosas.

**Si no tenés el código guardado en ningún lado**, decímelo en esta conversación y lo reconstruyo acá a partir de mi memoria de sesiones anteriores — pero quedaría marcado como *reconstrucción*, no como el artefacto original ya verificado, siguiendo el principio de Honestidad Radical (`constitution.md`, Artículo 4).

## 2. El diagrama SVG de arquitectura

Ya se produjo en una sesión previa pero no está disponible en este momento para incluirlo acá. Si querés que el agente lo mantenga sincronizado con el código (el enfoque Spec Anchored aplica también a los diagramas), vas a necesitar adjuntarlo aparte o pedirme que lo regenere.

## 3. Los textos originales de RFC-001 a RFC-006

Las `spec.md` y `plan.md` de este paquete son una **traducción funcional** de esos RFCs a formato SDD/EARS — no un reemplazo literal palabra por palabra. Si los documentos RFC originales tienen matices o contexto narrativo que no llegó a esta traducción, convendría que el agente los lea también en paralelo.

## 4. Qué ya agregué a este paquete para que no dependa de esta conversación

- `docs/DESIGN-CONVENTIONS.md` — las convenciones visuales de frontend (paleta, tipografías, convenciones del diagrama) que antes solo existían en la memoria de esta conversación.
- `agents.md`, sección 9 — cómo trabajar con vos como arquitecto no programador (comunicación en español, qué significa "sigue", cómo manejar reconstrucciones desde memoria).
- `agents.md`, sección 10 — este mismo resumen de qué falta, integrado directamente en el archivo que cualquier agente va a leer primero.
- `tasks.md` — nota sobre el patrón "Layla upgrade loop" pendiente de re-establecer, para que no se vuelva a perder.

## Resumen accionable

- [ ] Adjuntar el código fuente real (repo o `repid-prototype.zip`) junto con este paquete, si lo tenés.
- [ ] Adjuntar el diagrama SVG si querés que se mantenga sincronizado.
- [ ] Opcional: adjuntar los RFC-001 a RFC-006 originales si tienen detalle que las specs no capturaron.
- [ ] Si no tenés nada de código guardado, avisame y lo reconstruyo con las salvedades correspondientes.
