# GUÍA DE PRUEBAS — Prototipo RepID (para personas sin conocimientos de programación)

Esta guía te permite probar **todas las funciones del prototipo a mano**, paso a paso, y saber si cada una funcionó o no. No necesitás leer código ni escribir comandos más allá de los que se indican aquí.

> ¿Qué es RepID? Un experimento de reputación descentralizada sobre Bitcoin Cash. Cada persona tiene una **identidad** digital, registra **interacciones** con otros, los **califica** del 1 al 5, las **plataformas** pueden confirmar que esas interacciones ocurrieron, y las personas pueden **declarar confianza** entre sí. Todo queda registrado como *hechos* inmutables en una cadena (en este prototipo, la cadena es simulada).

---

## 1) Qué necesitás

- **Node.js ya instalado** en tu computadora (deberías tenerlo; en caso contrario, descargalo de `nodejs.org`).
- El proyecto RepID ya descargado en esta carpeta.

## 2) Cómo arrancar el prototipo

1. Abrí una **terminal** (PowerShell en Windows).
2. Entrando a la carpeta del proyecto:
   ```
   cd "RepID 1.2"
   ```
3. Levantá el servidor:
   ```
   npm start
   ```
4. Esperá hasta que veas este mensaje:
   ```
   Abrí la interfaz en tu navegador:
     http://localhost:3787
   ```
5. Abrí esa dirección en tu navegador (Chrome, Edge, etc.). ¡Esa es tu pantalla de prueba!

Para **cerrar** el prototipo: volvé a la terminal y presioná `Ctrl + C`.

---

## 3) La pantalla, de un vistazo

- **Columna izquierda**: los botones y formularios para hacer cada cosa ("paneles").
- **Columna derecha**: tiene tres pestañas. **«Ledger»** muestra la lista de *hechos* que quedaron registrados (del más nuevo al más antiguo — cada acción exitosa agrega una línea acá). **«Vista indexer»** muestra el lado técnico (transacciones crudas con hex y estado interno, Pruebas 12 a 14). **«Reputación»** muestra la historia agregada de una persona (Promedios y auditorías, Prueba 16).
- **Aviso verde/rojo** (abajo al centro): te confirma si la acción funcionó (verde) o qué salió mal (rojo).

Dato útil: cada vez que hagas una acción, revisá que aparezca la línea correspondiente en el Ledger **y** un aviso verde.

---

## 4) Pruebas paso a paso

Orden recomendado: hacelas en secuencia. Elegís las wallets con los menúes desplegables.

### Prueba 1 — Crear wallets
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Clic en **«Crear wallet»** (3 veces) | Aviso verde *«Wallet creada.»* y 3 direcciones nuevas en la lista *Wallets* |

> Una *wallet* es el "bolsillo" digital de una persona. Cada vez que la creás, aparece una dirección larga (su identificación técnica). No son dinero real.

### Prueba 2 — Mintear identidad
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Elegí la primera wallet en *Mintear identidad* → **Wallet** | — |
| 2 | Clic en **«Mintear identidad»** | Aviso verde *«Identidad minteada.»* y en el Ledger una línea **Identidad minteada** |

> *Mintear identidad* = crear tu identidad digital inmutable. Solo se puede hacer **una vez por wallet**.

### Prueba 3 — Registrar una interacción (el corazón del protocolo)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | En *Registrar interacción*: Parte A = wallet 1, Rol de A = `pasajero` | — |
| 2 | Parte B = wallet 2, Rol de B = `conductor` | — |
| 3 | Clic en **«Registrar interacción»** | Aviso verde *«Interacción registrada.»* y línea **Interacción registrada** en el Ledger |

> Esto registra que las dos partes realizaron una interacción juntas (ej. un viaje). Es la base para calificar.

### Prueba 4 — Error controlado: rol vacío
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Parte A = wallet 1, **dejá vacío el Rol de A** | — |
| 2 | Parte B = wallet 2, Rol de B = `conductor` | — |
| 3 | Clic en **«Registrar interacción»** | Aviso **rojo** explicando que cada parte debe tener un rol. No se agrega nada al Ledger |

> Este error es **deliberado**: el protocolo exige que cada parte declare explícitamente qué rol jugó.

### Prueba 5 — Emitir una calificación
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | En *Emitir calificación*: elegí la Rating Right de la wallet 1 (aparece como `w1 → w2`) | — |
| 2 | Mové el deslizador de puntaje al valor que quieras (ej. 5) | — |
| 3 | Clic en **«Emitir calificación»** | Aviso verde *«Calificación emitida.»* y línea **Calificación emitida** con tu puntaje |

> Cada persona solo puede calificar a la otra **una vez** por interacción (el protocolo lo garantiza por diseño).

### Prueba 6 — La misma Rating Right ya no existe
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Volvé a mirar *Emitir calificación* → *Rating Right* | Ya no aparece la que usaste. Solo quedan las no gastadas |

### Prueba 7 — La plataforma confirma la interacción
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | En *Confirmar interacción*: Plataforma = **la wallet 3** (aunque no tiene identidad) | — |
| 2 | Interacción a confirmar = la que registraste antes | — |
| 3 | Clic en **«Confirmar interacción»** | Aviso verde *«Interacción confirmada por la plataforma.»* y línea **Interacción confirmada** |

> Cualquier entidad (una app de viajes, por ejemplo) puede corroborar que la interacción ocurrió, **sin necesidad de tener identidad propia**.

### Prueba 8 — Declarar confianza (persona → persona)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | En *Declarar confianza*: Quién confía = wallet 1 | — |
| 2 | En quién = wallet 2 | — |
| 3 | Clic en **«Declarar confianza»** | Aviso verde *«Confianza declarada.»* y línea **Confianza declarada** |

> Es una declaración **unilateral**: la wallet 1 dice "confío en la 2", y la 2 no tiene que firmar nada.

### Prueba 9 — Autoconfianza → INVÁLIDO (error deliberado)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Quién confía = wallet 1, **En quién = la misma wallet 1** | Aviso rojo *«Elegí wallets distintas…»* (la interfaz no lo permite) |

> Y si lo intentaras contra el protocolo directamente, el Ledger lo marcaría **INVÁLIDO**: nadie puede declarar confianza en sí mismo.

### Prueba 10 — Ver el Ledger completo
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Mirá la columna derecha | Deben verse los 5 tipos de hecho: **Identidad minteada → Interacción registrada → Calificación emitida → Interacción confirmada → Confianza declarada** |

### Prueba 11 — Volver a empezar
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Clic en **«Reiniciar demo»** | Aviso verde *«Demo reiniciado…»*, lista de wallets vacía y Ledger vacío. Podés repetir todas las pruebas |

> Ahora te mostramos lo que **no se ve** desde la vista normal: el lado del indexer (el nodo que lee la cadena).

### Prueba 12 — La vista indexer: ver las transacciones crudas (hex)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Hacé algunas acciones si el Ledger está vacío (wallets, identidad, interacción…) | — |
| 2 | Arriba del panel derecho, hacé clic en la pestaña **«Vista indexer»** | En *Feed del nodo* aparecen las transacciones, cada una con etiqueta **verde «Reconocida»**, el nombre del hecho, su identificador (txid) y su tamaño en bytes |
| 3 | Clic en una fila cualquiera del feed | Se despliega el **hex crudo** de la transacción — exactamente lo que circula por la red Bitcoin |
| 4 | Bajá a *Estado interno del indexer* | Ves las **Rating Rights bajo seguimiento** y los **Receipts en el índice**: el rastro interno que usa el indexer (RFC-006) para poder re-identificar gastos y validar confirmaciones |

> En la vista normal ves la *interpretación* (el hecho). En esta vista ves los *datos* que el indexer procesó para llegar a esa interpretación.

### Prueba 13 — Una transacción desconocida → el indexer la descarta
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Estando en la pestaña **«Vista indexer»**, clic en **«Enviar transacción desconocida»** | Aviso verde *«Transacción desconocida enviada y descartada…»* |
| 2 | Mirá el *Feed del nodo* (arriba) | La transacción más reciente lleva etiqueta **roja «Descartada»** y dice «no es RepID» |
| 3 | Cambiá a la pestaña **«Ledger»** | El Ledger **no** cambió: esa transacción no produjo ningún hecho |

> Este es el principio más importante del protocolo: **la cadena guarda todo, pero el indexer solo interpreta las formas RepID**. Todo lo demás pasa por la red y se ignora.

### Prueba 14 — Reinicio completo (ahora con la vista indexer)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Clic en **«Reiniciar demo»** | Aviso verde |
| 2 | Pestaña «Vista indexer» | *Feed del nodo* dice «Todavía no llegó ninguna transacción»; Rating Rights: Ninguna; Receipts: Ninguno. Todo el rastro de interpretación también quedó limpio |

### Prueba 15 — Reproducir la demo automática (el sistema vive solo)
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Clic en **«Reproducir demo»** (último panel de la columna izquierda) | Aviso verde con el resumen (ej. *«Demo lista: 7 hechos (3 wallets, 2 calificaciones)»*) |
| 2 | Mirá el Ledger | Aparecieron: 1 identidad, **2** interacciones, **2** calificaciones, 1 confirmación y 1 confianza — todo en 1 clic |
| 3 | Pestaña «Vista indexer» | El feed del nodo se llenó con el hex de todas esas transacciones |
| 4 | Pestaña «Reputación», elegí una wallet y «Ver perfil» | La wallet elegida muestra su historia (promedio, quiénes la calificaron, quién confía en ella) |

> Es la misma operación que harías a mano, ejecutada sola por el servidor. No introduce ninguna forma nueva del protocolo: reutiliza exactamente las mismas transacciones.

### Prueba 16 — Leer el perfil de reputación y auditar cada número
| Paso | Qué hacés | Resultado esperado |
|---|---|---|
| 1 | Pestaña **«Reputación»** → elegí una wallet → **«Ver perfil»** | Ves: promedio recibido, distribución de puntajes 1–5 con barras, confianza recibida y recibos confirmados |
| 2 | Mirá "Identidad" | «sí» con su txid si la wallet minteó identidad, o «no» si solo es una wallet |
| 3 | Bajá a *Calificaciones recibidas (auditables)* | Cada puntaje lista **de quién** viene y el **txid** de la transacción que lo produjo |
| 4 | Anotá un txid y buscálo en la pestaña «Ledger» o «Vista indexer» | Encontrás exactamente la transacción que respalda ese número |

> Este es el corazón de RepID: la reputación es **interpretación sobre la cadena, nunca dentro de la cadena**. Cada promedio se puede desarmar hasta la transacción que lo generó. El sistema no pondera ni juzga: solo suma hechos verificables.

---

## 5) ¿Qué significan las cosas en el Ledger?

- **Identidad minteada**: nació una identidad digital.
- **Interacción registrada**: dos personas hicieron algo juntas (con roles).
- **Calificación emitida**: una persona puntuó a la otra (1 a 5).
- **Interacción confirmada**: una plataforma corroboró la interacción.
- **Confianza declarada**: una persona declaró que confía en otra.
- **Reconocida / Descartada** (en la Vista indexer): el indexer detectó una forma RepID en la transacción (y la interpreta) o decidió que no lo es (y la ignora).

Si una línea dice **INVÁLIDA**, es que la transacción no cumple las reglas (por ejemplo autoconfianza); el sistema igual la muestra para no ocultar actividad, pero la marca como inválida.

---

## 6) Importante — limitaciones honestas del prototipo

- La cadena por defecto es **simulada** (no es Bitcoin Cash real): no hay fondos reales ni efectos en una red pública. (En la **sección 7** está el modo opcional que sí usa la red de pruebas real de Bitcoin Cash.)
- Los *hechos* quedan guardados en un archivo local; si borrás esa carpeta, se pierde el historial.
- **Identidad perdida = no hay vuelta atrás**: la identidad se acuña una sola vez y queda bloqueada a su clave. Si perdés la clave de una wallet, esa identidad **no se puede recuperar ni re-emitir** (decisión del protocolo: inmutabilidad). En pruebas conviene guardar/custodiar las claves que te importen.
- Las pruebas de seguridad más profundas (errores 400/404/409, score fuera de rango, etc.) se cubren con la **prueba automática**, que corre sola con el comando:
  ```
  npm run test:e2e
  ```
  (esto sí es técnico; no hace falta que lo corras para probar el prototipo a mano).

---

## 7) Probar en la red real (Chipnet, tBCH sin valor) — opcional pero espectacular

Hasta acá todo corrió en una **cadena simulada**. También existe un modo que usa la **red de pruebas real de Bitcoin Cash (Chipnet)**: las transacciones que hace el prototipo circulan por una red pública, se pueden ver en un explorador de bloques, y la máquina virtual de Bitcoin real valida los contratos. Como son tokens de prueba (tBCH), no tienen valor: es un "playground" público.

> **Lo importante que vas a verificar acá**: que los contratos de RepID son aceptados por **la Bitcoin real** (no solo por el simulador). Si el simulador obedece, pero la red real no, el prototipo no sirve.

### 7.1) La manera automática (recomendada)

1. En la terminal:
   ```
   $env:REPID_NETWORK="chipnet"
   node scripts/chipnet-e2e.mjs
   ```
2. La primera vez va a decir algo como *«E2E Chipnet esperando tBCH real»* y te va a mostrar una **dirección** a fondear.
3. Entrá a `https://tbch.googol.cash`, pegá esa dirección y completá el captcha (es manual a propósito).
4. Cuando el faucet te confirme la gota tBCH, **volvé a correr el mismo comando**.
5. Debería correr, solo, el flujo completo: crear 3 personas, mintear identidad, registrar 2 interacciones, emitir 2 calificaciones, confirmar 1 interacción y declarar 1 confianza — y contar cada una como **PASS**.
6. Al final mirás los txids en pantalla. Podés buscar cualquiera de ellos en un explorador de bloques de Chipnet (ej. `https://chipnet.imaginary.cash/explorer`) para ver la transacción real, con su hex y sus tokens.

> Los pasos 1 y 2 se quedan "esperando" si no hay fondos: no es un error, es que falta la gota del faucet. Cuando la recibiste, la misma dirección ya tiene saldo y el comando rinde.

### 7.2) La manera manual (por la interfaz, como la sección 4)

1. En la terminal:
   ```
   $env:REPID_NETWORK="chipnet"
   npm start
   ```
2. Cuando veas el mensaje de arranque, abrí `http://localhost:3787`. Arriba debe aparecer el aviso **«Red real Chipnet»**.
3. Creá una wallet. En la lista, hacé clic en **«Saldo»**: te muestra la dirección completa con saldo 0 tBCH.
4. Fondéala en el faucet de arriba (misma dirección) y volvé a hacer clic en **«Saldo»**: ahora el saldo es real, en sats.
5. Repetí las **Pruebas 2 a 10** de este documento: ahora cada *hecho* del Ledger fue **broadcasteado a la red de pruebas real**.
6. En la pestaña «Vista indexer», cada transacción muestra un **badge de estado**: *en mempool* (recién enviada, a la espera de un bloque) o *confirmada · bloque N* (ya quedó sellada en la cadena). Recargá la página cada tanto para ver cómo pasa de mempool a confirmada.
7. Tomá un txid del Ledger y buscálo en el explorador de bloques de Chipnet para ver la transacción real.

> Dato técnico breve: las wallets de prueba de este modo se guardan en la carpeta `data/` (claves tBCH sin valor). Si reiniciás el servidor, reaparecen con su saldo — es un detalle del prototipo, no de producción.

### 7.3) Importante sobre el faucet

- El faucet `tbch.googol.cash` entrega **tBCH** (juguete, sin valor), una gota por vez y con captcha.
- La dirección del mapa es la que ves en **«Saldo»** (empieza con `bchtest:`). No uses una dirección real de Bitcoin Cash (empezaría con `bitcoincash:`).
- Si apretás recargar demasiado seguido, el faucet puede quejarse; esperá unos segundos.

---

## 8) Referencia rápida de comandos

Origen recomendado para **probarlo en segundos**: clic en «Reproducir demo» y después pestaña «Reputación» → una wallet → «Ver perfil».

| Qué querés hacer | Comando |
|---|---|
| Levantar el prototipo | `npm start` |
| Correr las pruebas automáticas del protocolo | `npm test` |
| Correr la prueba automática de todo el flujo | `npm run test:e2e` |