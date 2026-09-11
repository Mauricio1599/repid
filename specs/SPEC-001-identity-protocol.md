# SPEC-001: Protocolo de Identidad

## 1. Contexto y Objetivo

RepID necesita una unidad de identidad on-chain que sea inmutable, verificable y no dependa de una autoridad central. Esta identidad es la base sobre la cual se construyen las interacciones y calificaciones del resto del protocolo. Se implementa como un NFT (CashToken) acuñado una única vez y bloqueado al P2PKH de su propietario.

## 2. Historias de Usuario

- Como usuario, quiero crear una identidad inmutable en la blockchain para poder participar en el protocolo de reputación sin depender de una autoridad central.
- Como usuario, quiero que mi identidad no pueda ser alterada ni duplicada por nadie, incluido yo mismo, para que sea confiable como ancla de reputación.

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe generar una transacción de génesis que acuñe un NFT de identidad inmutable.
- **RF-02** (Ubicuidad): El sistema debe bloquear el NFT de identidad al P2PKH del propietario.
- **RF-03** (Comportamiento No Deseado): Si el outpoint gastado en la transacción de génesis tiene `vout` distinto de 0, entonces el sistema debe rechazar la transacción.
- **RF-04** (Comportamiento No Deseado): Si ya existe un NFT de identidad acuñado a partir de un UTXO determinado, entonces el sistema debe impedir un segundo minteo sobre el mismo (covenant de un solo uso).
- **RF-05** (Opciones): Donde se requiera verificar la categoría del token dentro del covenant, el sistema debe interpretar los bytes devueltos por `tokenCategory` en orden de visualización invertido.
- **RF-06** (Ubicuidad): La transacción de génesis debe incluir un output de cambio P2PKH al propietario; el cambio no puede portar tokens minteados en esa misma transacción. Esto habilita el gasto en red real (Chipnet) sin perder el valor del UTXO de funding en fees (modo Mock puede emitirlo igualmente por consistencia).

## 4. Requisitos No Funcionales

- El covenant debe implementarse en CashScript (cashc 0.13.2).
- La verificación de unicidad del minteo se apoya en las garantías de un solo uso de UTXO — no requiere estado externo.
- No hay requisitos de rendimiento críticos para el MVP (transacción única, sin loops).

## 5. Casos Límite y Restricciones

- Intento de gastar un outpoint con `vout != 0` en la génesis → transacción rechazada por `MockNetworkProvider` con un error de validación de tokens, no relacionado con la lógica propia del covenant.
- Confusión de orden de bytes entre `tokenCategory` (invertido) y `outpointTransactionHash` de libauth (ya en orden de visualización) — son casos opuestos y deben tratarse por separado.

**Decisión de diseño confirmada** (Sección A de `tasks.md`, TASK-028, 2026-09-10):
- **Pérdida de clave privada**: riesgo aceptado en el MVP. La identidad es inmutable y no existe mecanismo on-chain de recuperación; una clave perdida implica una identidad perdida de forma irremediable. Se recomienda a los usuarios el respaldo off-chain de sus claves (custodia de la frase/lave), y la documentación del prototipo lo advierte explícitamente.

## 6. Fuera de Alcance

- Mecanismos de revocación o actualización de identidad (la identidad es inmutable por diseño; no se permite editarla). Posible diseño de revocación/re-emisión en un ciclo posterior — no programada.
- Identidad multi-firma o multi-propietario (posible RFC futuro).
- Verificación KYC o de identidad off-chain.

## 7. Criterios de Aceptación (Definition of Done)

- [x] La transacción de génesis acuña el NFT correctamente bloqueado a P2PKH.
- [x] Un segundo intento de minteo sobre el mismo UTXO es rechazado.
- [x] El covenant exige el output de cambio P2PKH al propietario y rechaza minteos ocultos (8 tests `IdentityGenesisValidator`).
- [ ] El código cumple con `constitution.md`.
