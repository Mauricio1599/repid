# Contribuyendo a RepID

Gracias por interesarte en RepID. Este documento resume cómo correr el proyecto localmente y qué reglas rigen los cambios — son las mismas que rigen para el agente de IA que trabaja con Mauricio (`AGENTS.md`).

## 1. Qué es y qué NO es esto

RepID es un **protocolo de reputación descentralizado** sobre Bitcoin Cash (CashTokens + CashScript). La blockchain almacena hechos inmutables; la interpretación (reputación) vive off-chain. El repositorio contiene un **prototipo funcional** que demuestra el protocolo: contratos CashScript, un indexer que lee transacciones crudas, y un servidor web de demo con dos modos (mock y Chipnet).

## 2. Requisitos

- Node.js 22+ y npm.
- No se requiere red para la suite de tests (corre en la red simulada).

## 3. Comandos

| Comando | Qué hace |
|---|---|
| `npm install` | Instala dependencias. |
| `npm test` | Corre la suite completa (protocolo + servidor). |
| `npm run test:e2e` | Solo la suite end-to-end del servidor. |
| `npm start` | Levanta el prototipo en `http://localhost:3787` (modo mock). |
| `REPID_NETWORK=chipnet npm start` | Modo red de pruebas real (requiere tBCH; ver `GUIA_DE_PRUEBAS.md` §7). |

## 4. Arquitectura en 3 reglas

1. **La cadena guarda hechos; la interpretación queda off-chain.** No combinar ambas capas.
2. **Simplicidad sobre complejidad.** Si algo se puede hacer sin covenant propio, se hace sin covenant.
3. **Tests antes que código.** Un Requisito Funcional (RF) de una spec no está completo hasta tener un test real que lo respalde.

## 5. Convenciones

- **Código en inglés** (identificadores, comentarios técnicos); **documentación y comunicación en español**.
- Cada RFC-001→006 tiene su spec en `specs/SPEC-00X-*.md` (formato EARS). Los cambios de comportamiento del protocolo deben reflejarse también allí (spec-anchored).
- La suite completa debe quedar en verde antes de cualquier PR (`npx vitest run`).
- El estado de las tareas y sus decisiones vive en `tasks.md` con formato `TASK-NNN`.

## 6. Qué NO hacer sin Plan aprobado

- **No modificar contratos CashScript ni la lógica del Indexer** sin pasar antes por el modo de plan (diseño → aprobación → test).
- **No resolver asunciones abiertas de las specs** por cuenta propia: son decisiones de diseño del arquitecto.
- **No afirmar que un test pasa sin haberlo corrido.**
- No versionar claves ni persistencia local (`data/`, `data_chipnet_e2e/` quedan fuera del repo).

## 7. Flujo sugerido para una contribución

1. Leé la spec del área que tocas (`specs/`) y el hallazgo técnico correspondiente en `AGENTS.md` §7 (hay trampas conocidas de tooling que no se deben redescubrir).
2. Implementá con su test.
3. Corré `npm test` (toda la suite).
4. Abrí el PR; el CI corre la misma suite.