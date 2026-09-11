# constitution.md — RepID
## Ley Suprema del Proyecto

Este documento contiene los principios innegociables de RepID. **En caso de conflicto entre este documento y cualquier `spec.md`, prevalece esta Constitución.**

---

## Artículo 1 — Principio Arquitectónico Central

La blockchain almacena **hechos inmutables**. La interpretación de esos hechos permanece **fuera de la cadena**. Ningún artefacto de RepID debe introducir lógica de interpretación subjetiva (scoring compuesto, ponderaciones, juicios de valor) dentro de un covenant on-chain. Eso es responsabilidad de capas superiores, no del protocolo base.

## Artículo 2 — Simplicidad sobre Complejidad

Se prefiere siempre la solución más simple que satisfaga el Requisito Funcional vigente. No se añade lógica especulativa para casos de uso futuros que no estén documentados en una `spec.md` activa. Ejemplo aplicado: no se implementa un esquema de commit-reveal para las calificaciones porque el Recibo ya se firma antes de que exista cualquier calificación — agregarlo sería complejidad sin beneficio.

## Artículo 3 — Tests Antes que Código

Todo Requisito Funcional (RF) debe tener un test escrito con base en los Criterios de Aceptación de su `spec.md` correspondiente, **antes** de considerarse implementado. Un RF sin test asociado no está completo, sin importar que el código "parezca" funcionar.

## Artículo 4 — Honestidad Radical

- Ningún resultado de test, cobertura o validación se reporta como cierto sin haberse verificado realmente ejecutándolo.
- Las limitaciones de las herramientas (ej. `MockNetworkProvider` no ejecuta la VM ni valida firmas) se documentan explícitamente, nunca se omiten.
- Una afirmación no verificable con el tooling disponible se **elimina** del artefacto en lugar de dejarse como un reclamo engañoso o "casi cierto".

## Artículo 5 — Idioma

- **Código, nombres de contratos, identificadores técnicos:** inglés.
- **Documentación, specs, RFCs, comunicación con el arquitecto del proyecto (Mauricio):** español.

## Artículo 6 — "Fuera de Alcance" es Ley

Toda funcionalidad marcada como "Fuera de Alcance" en una `spec.md` vigente **no se implementa**, aunque parezca trivial de agregar, hasta que una nueva versión de esa spec la incorpore explícitamente. Esta es la defensa principal contra el scope creep.

## Artículo 7 — Trazabilidad Obligatoria

Cada tarea en `tasks.md` debe referenciar el RF de la `spec.md` que satisface. Ninguna tarea se marca como completa sin que su RF correspondiente esté validado con un test real y ejecutado.

## Artículo 8 — Gobernanza para un Arquitecto No Programador

Mauricio, arquitecto del proyecto, no audita el código línea por línea — no es su rol ni su expertise. Valida mediante:
1. Revisión de la especificación (`spec.md`) en lenguaje natural.
2. Resultados reales de tests (no relatos de resultados).
3. Demostraciones funcionales del prototipo.

Por esto, el agente de IA tiene una **responsabilidad reforzada** de no inducir a error: no habrá una segunda línea de defensa humana revisando el código.

## Artículo 9 — Modo Plan Obligatorio

Ninguna modificación de contratos CashScript o de la lógica del Indexer se realiza sin aprobación previa de la estrategia de implementación (Modo Plan / Modo Arquitecto). El código no se toca hasta validar la intención.

## Artículo 10 — Nivel de Compromiso con la Especificación

RepID opera bajo el enfoque **Spec Anchored**: sincronización bidireccional entre código y especificación. Todo cambio relevante en el código (contratos, indexer, servidor) debe reflejarse en la `spec.md` o `plan.md` correspondiente, y viceversa. La documentación nunca queda obsoleta por omisión.
