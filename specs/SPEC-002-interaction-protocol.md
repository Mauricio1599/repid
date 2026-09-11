# SPEC-002: Protocolo de Interacción

> ✅ Estado: implementado (TASK-005 a TASK-007). Modelo de datos de "Interacción" formalizado en `plan.md` §2, validación de roles y generación de metadatos implementadas con 9 tests pasando en `test/interaction.test.js`.

## 1. Contexto y Objetivo

Antes de que exista un Recibo de Interacción (RFC-003) firmado on-chain, debe existir una definición clara, a nivel de aplicación, de qué interacción están teniendo dos partes y qué rol cumple cada una. El Protocolo de Interacción es la capa de metadatos —principalmente off-chain— que una aplicación externa usa para describir esa interacción antes de solicitar su registro como Recibo.

## 2. Historias de Usuario

- Como aplicación externa integradora, quiero definir una interacción entre dos partes para poder luego generar un Recibo de Interacción firmado conjuntamente.
- Como parte de una interacción, quiero que mi rol quede explícito desde el inicio, para que la calificación posterior tenga contexto.

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe permitir que una aplicación externa defina una interacción entre exactamente dos partes (`partyA`, `partyB`).
- **RF-02** (Ubicuidad): El sistema debe requerir que cada interacción especifique un rol explícito para cada parte.
- **RF-03** (Eventos): Cuando una interacción sea definida, el sistema debe generar los metadatos necesarios para la posterior emisión de un Interaction Receipt (RFC-003).
- **RF-04** (Comportamiento No Deseado): Si una interacción no especifica roles para ambas partes, entonces el sistema debe rechazar la definición de la interacción.

## 4. Requisitos No Funcionales

- El Protocolo de Interacción opera principalmente a nivel de aplicación (off-chain); no impone una transacción on-chain propia.
- Debe permanecer agnóstico al dominio de negocio específico de la aplicación que lo integre (compraventa, freelancing, alquileres, etc.).

## 5. Casos Límite y Restricciones

- Interacciones con más de dos partes: no soportadas. `ReceiptGenesisValidator` (RFC-003) fija la participación en exactamente dos firmantes, decisión confirmada en `tasks.md` (TASK-001). Las interacciones grupales se modelan como múltiples recibos pairwise en la capa de aplicación.
- Roles ambiguos o vacíos → rechazo según RF-04.

## 6. Fuera de Alcance

- Interacciones multi-parte (>2).
- Flujo de cancelación o disputa de una interacción antes de que se convierta en Recibo: **aplazado conscientemente** (Sección A de `tasks.md`, TASK-028, 2026-09-10). Su ausencia no bloquea el MVP: en la capa de aplicación, una interacción sin acuerdo simplemente no llega a emitir su Recibo.
- Persistencia on-chain de la definición de interacción (solo el Recibo resultante se ancla on-chain, vía RFC-003).

## 7. Criterios de Aceptación (Definition of Done)

- [x] Modelo de datos de "Interacción" formalizado en `plan.md` §2 (TASK-005).
- [x] Validación de roles explícitos implementada y testeada (TASK-006).
- [x] Confirmación de Mauricio sobre la asunción de "exactamente 2 partes" (TASK-001).
- [ ] El código cumple con `constitution.md`.
