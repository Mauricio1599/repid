# plan.md — RepID
## Diseño Técnico (cubre RFC-005: Implementación de Referencia BCH, y RFC-006: Especificación del Indexer)

Este documento traduce las specs funcionales (SPEC-001 a SPEC-006) en decisiones técnicas concretas. Describe el **cómo**, a diferencia de las `spec.md` que describen el **qué** y el **por qué**.

---

## 1. Módulos

| Módulo | Responsabilidad | Estado |
|---|---|---|
| `contracts/IdentityGenesisValidator.cash` | Covenant de un solo uso que acuña el NFT de identidad (SPEC-001) | ✅ |
| `contracts/ReceiptGenesisValidator.cash` | Covenant firmado conjuntamente que acuña el Recibo + 2 Rating Rights (SPEC-003) | ✅ |
| Spend `ISSUED_RATING` | Script P2PKH con `OP_RETURN` que gasta un Rating Right (SPEC-004) | ✅ |
| `indexer/` (`decodeTransactionBCH`) | Reconstruye hechos estructurados desde hex crudo de transacciones (RFC-006) | ✅ |
| `indexer/memoryStore` | Rastrea outpoints vivos de Rating Rights y txids de Receipts (necesario porque el NFT se quema al gastarse) | ✅ |
| `indexer/jsonFileStore` | Variante persistente del store en archivo JSON local (rating rights + índice de receipts, reinicios) | ✅ |
| `server/` (Express) | Prototipo de consola web de dos columnas para demo end-to-end; valida roles (SPEC-002), usa el store persistente, permite confirmación de plataforma (SPEC-003 RF-06) y declaración de confianza (SPEC-006) | ✅ |
| `interaction/repid-interaction.mjs` (SPEC-002) | Modelo de metadatos pre-Recibo (roles explícitos, derivación de inputs del covenant) | ✅ |

## 2. Modelo de Datos

**Interacción (off-chain, SPEC-002)** — metadatos a nivel de aplicación que definen una interacción entre dos partes antes de su registro como Recibo (RFC-003). Es la entrada que alimenta la génesis del Recibo. Operan fuera de la cadena (Constitución, Artículo 1); solo el Recibo resultante se ancla on-chain.

```js
// DefineInteractionInput — aportado por la aplicación externa
{
  protocolRef: string,       // id/ref de la interacción en la app (opcional, no interpretado on-chain)
  partyA: { pkh: bytes20, role: string },   // primer participante (dueño del Recibo, ver RFC-003 RF-04)
  partyB: { pkh: bytes20, role: string },   // segundo participante
}

// Interaction — resultado formalizado (aquí se derivan los inputs del covenant)
{
  protocolRef: string,
  partyA: { pkh, role },
  partyB: { pkh, role },
  createdAt: string,   // ISO timestamp off-chain (no se ancla)
}

// Derivación hacia ReceiptGenesisValidator (RFC-003):
//   partyA_pkh = partyA.pkh, partyB_pkh = partyB.pkh
```

Reglas:
- `role` es un string libre, agnóstico de dominio ("pasajero", "conductor", "comprador"…) — RepID lo transporta pero no lo interpreta.
- `partyA.pkh` y `partyB.pkh` deben existir (no vacíos) y ser distintos entre sí.
- Si falta `pkh` o `role` en cualquiera de las dos partes → rechazo (RFC-002 RF-04).

**Identity NFT**
- `owner_pkh`: hash de clave pública del propietario (bloqueo P2PKH).
- Categoría del token = identificador único de la identidad.

**Interaction Receipt NFT**
- `partyA_pkh`, `partyB_pkh`
- `roles`: rol declarado de cada parte (pendiente de formalizar en SPEC-002).
- Referencia implícita a los dos Rating Rights acuñados en la misma transacción.

**Rating Right (UTXO)**
- Commitment: `owner_pkh` (decisión actual — ver asunción abierta en SPEC-004 §5).
- Al gastarse: `OP_RETURN` con score (entero 1–5).

**Hecho indexado (output del Indexer)**
- Tipo de hecho (Identity genesis / Receipt genesis / Rating issued / Platform confirmation).
- Outpoint de origen y de destino.
- Payload decodificado (score, pkh, categoría, txid de Recibo referenciado).
- Estado: vivo / gastado (relevante para Rating Rights, que se queman). Para confirmaciones de plataforma: `valid` según si el Recibo referenciado está indexado.

## 3. Algoritmos

- **Validación de génesis (Identity / Receipt):** el covenant verifica que el outpoint gastado tenga `vout == 0` (constraint de CashTokens) y que la categoría del token resultante sea consistente, comparando bytes en el orden invertido que devuelve `tokenCategory`.
- **Reconstrucción del Indexer:** `decodeTransactionBCH` parsea el hex crudo → se extraen inputs/outputs con tokens → se clasifica el hecho según el patrón de outputs (genesis de identidad, genesis de recibo + 2 rating rights, spend de rating right con `OP_RETURN`, atestación de plataforma o declaración de confianza). `outpointTransactionHash` ya viene en orden de visualización desde libauth y no se invierte (cuidado: es el caso opuesto a `tokenCategory`).
- **PLATFORM_CONFIRMATION (SPEC-003 RF-06, patrón C):** la plataforma gasta un UTXO P2PKH propio (sin Identidad) con `OP_RETURN: <tag REPID_PLATFORM1> <txid del Recibo, 32 bytes>`. El indexer recupera el pkh del firmante desde el scriptSig del primer input y valida la referencia contra el índice de Receipts; si el Recibo no está indexado, el hecho se reconoce pero se marca `valid: false`.
- **TRUST_LINK (SPEC-006):** declaración unilateral — A gasta un UTXO P2PKH con `OP_RETURN: <tag REPID_TRUST1> <pkh de B, 20 bytes>`. Sin consentimiento de B y sin Rating Rights. Si A == B, se marca `valid: false`.
- **MemoryStore / JsonFileStore:** mantienen un mapa de outpoints de Rating Rights vivos y un índice de txids de Receipts; al detectar un spend válido, marcan el outpoint como consumido y registran el score decodificado.

## 4. Estrategia de Testing

- **Test runner:** vitest.
- **Simulación:** `MockNetworkProvider`. Limitación conocida y aceptada: no ejecuta la VM de Bitcoin ni valida firmas o scripts — un envío exitoso no es evidencia de que el script sea correcto por sí solo; se complementa con aserciones explícitas sobre la estructura de la transacción resultante.
- **Casos no verificables con el tooling actual:** pruebas de "impostor" (un firmante no autorizado intentando gastar) usando un Unlocker personalizado con P2PKH son inconclusas porque `debug()` rechaza esas transacciones antes de evaluarlas. Esto se documenta explícitamente en vez de reclamarse como cobertura (Constitución, Artículo 4).
- **Regla de cobertura (Constitución, Artículo 3 y 7):** cada RF de cada spec.md debe tener al menos un test que lo verifique explícitamente, no solo un test genérico del contrato.

## 5. Persistencia

El Indexer requiere estado persistente porque el NFT de Rating Right se quema al gastarse — sin registro externo, se pierde la trazabilidad de "quién ya calificó". Para el MVP se usa `createMemoryStore` (en memoria, no persistente entre reinicios).

**Persistencia del prototipo (TASK-004, Opción A — confirmada):** `createJsonFileStore(filePath)` persiste el estado de Rating Rights y el índice de Receipts en un archivo JSON local:
- Carga el estado al arrancar desde el archivo (arranque limpio si no existe — ignorando `ENOENT`).
- Re-escribe el archivo tras cada Rating Right registrada y tras cada Receipt indexado.
- Sobrevive reinicios del proceso; comparte la misma interfaz que `createMemoryStore`, por lo que `indexRawTransaction` no cambia.

**Producción (fuera de alcance del MVP):** una DB real (SQLite u otra) reemplazará el archivo JSON cuando el proyecto escale — decisión diferida a una futura iteración.

## 6. Dependencias de Red

- La actualización de red de BCH **"Layla" (mayo 2026)** habilita loops dentro de covenants de CashScript. Ningún contrato actual de RepID depende de esta capacidad; se registra aquí para evaluar en futuras versiones si simplifica algún covenant (ej. validación de N partes en el Recibo, si esa dirección se confirma).
- ⚠️ El patrón **"Layla upgrade loop"** mencionado en sesiones previas se perdió en un reset de entorno y **no fue reconstruido** (TASK-012b): sin fuente original, reconstruirlo a ciegas violaría la Honestidad Radical (Constitución, Art. 4). Si en el futuro aparece una referencia (nota de sesión, chat, correo), esta sección es el ancla para volver a documentarlo.

## 7. Convenciones Técnicas Vinculantes (repetidas de agents.md para visibilidad en el flujo de diseño)

- CashTokens genesis exige `vout == 0` en el outpoint gastado.
- `tokenCategory` en covenants → bytes en orden invertido.
- `outpointTransactionHash` (libauth) → ya en orden de visualización.
- `addOpReturnOutput` → UTF-8 por defecto, usar prefijo `"0x"` para bytes crudos.
