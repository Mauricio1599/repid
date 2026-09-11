# SPEC-003: Protocolo de Recibo de Interacción

## 1. Contexto y Objetivo

El Interaction Receipt es el hecho inmutable central de RepID: un NFT que solo puede existir si ambas partes de una interacción lo firmaron conjuntamente. Actúa como **capa anticorrupción** entre los protocolos de interacción específicos de cada aplicación (RFC-002) y el núcleo de RepID, evitando que lógica de negocio externa contamine el protocolo base.

## 2. Historias de Usuario

- Como par de participantes en una interacción, quiero firmar conjuntamente un recibo inmutable para que quede registrado como un hecho verificable en la cadena.
- Como participante, quiero recibir un Derecho de Calificación (Rating Right) al momento de crear el recibo, para poder calificar a la otra parte más adelante sin depender de una acción adicional de terceros.

## 3. Requisitos Funcionales (Sintaxis EARS)

- **RF-01** (Ubicuidad): El sistema debe acuñar un NFT de Interaction Receipt únicamente cuando ambas partes firmen conjuntamente la transacción de génesis.
- **RF-02** (Ubicuidad): El sistema debe acuñar, en la misma transacción de génesis, dos UTXOs de Rating Right, uno por cada parte.
- **RF-03** (Ubicuidad): El sistema debe fijar la participación en exactamente dos partes por recibo.
- **RF-04** (Ubicuidad): El sistema debe bloquear el Interaction Receipt a `partyA`; esta regla la impone el covenant (`ReceiptGenesisValidator`), no es mera convención de aplicación.
- **RF-05** (Ubicuidad): El sistema debe funcionar como capa anticorrupción, sin heredar lógica de negocio específica de la aplicación externa dentro del Recibo.
- **RF-06** (Eventos): Cuando una entidad validadora (plataforma/aplicación) quiera corroborar que una interacción ocurrió, el sistema debe registrar una confirmación como hecho independiente on-chain (attestation separada), sin modificar la transacción de génesis del Recibo.
- **RF-07** (Ubicuidad): La transacción de génesis del Recibo debe incluir un output de cambio P2PKH a `partyA` (la parte que financia la génesis); el cambio no puede portar tokens minteados en esa misma transacción. Esto habilita el gasto en red real (Chipnet) sin perder el valor del UTXO de funding en fees.

## 4. Requisitos No Funcionales

- La firma conjunta debe verificarse a nivel de covenant (CashScript), no delegarse a validación off-chain.
- No se requiere un esquema de commit-reveal: el Recibo se firma antes de que exista cualquier calificación, por lo que no hay información sensible que proteger en ese momento.

## 5. Casos Límite y Restricciones

**Decisiones de diseño confirmadas** (Sección A de `tasks.md`, TASK-001 y TASK-002):
- RF-03: la participación queda fijada en exactamente 2 partes por recibo. Las interacciones grupales se modelan como múltiples recibos pairwise (uno por par) en la capa de aplicación. La extensión a N partes queda fuera de alcance.
- RF-04: el bloqueo del Recibo a `partyA` es una regla impuesta por el covenant (`ReceiptGenesisValidator`), no una convención de aplicación. La única convención restante es que la aplicación defina quién es `partyA` (RFC-002).

- Firma faltante de una de las dos partes → la transacción de génesis es inválida y no se acuña nada (ni Recibo ni Rating Rights).
- Confirmación de una interacción por un tercero (plataforma) → attestation separada con gasto P2PKH + `OP_RETURN` (patrón análogo a `ISSUED_RATING`), no extensión del covenant. La entidad que confirma gasta un UTXO propio con un tag de protocolo y una referencia al txid del Recibo ya indexado.

**Decisión de diseño confirmada (patrón C, TASK-016):**
- La validadora no necesita mintear una Identidad propia: basta su pkh (gasto P2PKH del UTXO que firma).
- El Indexer reconoce `PLATFORM_CONFIRMATION` solo si el Recibo referenciado ya fue indexado (traceabilidad). Si se referencia un Recibo desconocido, el hecho se reconoce pero se marca `valid: false` (no se ignora en silencio).

## 6. Fuera de Alcance

- Esquema de commit-reveal para calificaciones (innecesario para el MVP, ver Requisitos No Funcionales).
- Recibos multi-parte (>2). Las interacciones grupales se descomponen en recibos pairwise en la capa de aplicación.
- Modificación de la transacción de génesis para incluir la validadora: la confirmación de plataforma es siempre un hecho separado (RF-06), nunca se agrega a la génesis del Recibo.

## 7. Criterios de Aceptación (Definition of Done)

- [x] La transacción de génesis requiere firma conjunta de ambas partes.
- [x] Se acuñan dos Rating Rights junto con el Recibo en una sola transacción.
- [x] El covenant exige el output de cambio P2PKH a `partyA` y rechaza minteos ocultos (10 tests `ReceiptGenesisValidator`, RF-07).
- [x] Decisiones de diseño de la sección 5 confirmadas por Mauricio (TASK-001, TASK-002).
- [x] `PLATFORM_CONFIRMATION` (RF-06) cubierto por tests del Indexer (TASK-016).
- [ ] El código cumple con `constitution.md`.
