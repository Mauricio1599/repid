# RepID

**A decentralized identity & reputation protocol built on Bitcoin Cash — via CashTokens and CashScript.**

> **TL;DR (English):** RepID turns the BCH blockchain into an immutable ledger of *facts* — who you are (identity NFT), what happened between two parties (interaction receipts + rating rights), how they rated each other (1–5), platform confirmations, and person-to-person trust links. The chain stores facts; **all interpretation stays off-chain** (reputation scores, policies, anti-sybil logic). This repo is a fully working reference prototype: the CashScript covenants, an indexer (RFC-006), and a live web console to try the whole flow.

---

## Qué es RepID

RepID es un protocolo de reputación descentralizada construido sobre **Bitcoin Cash (BCH)**, que usa **CashTokens** y **CashScript**.

**Principio arquitectónico (innegociable):** la blockchain almacena *hechos inmutables*; la interpretación de esos hechos — puntajes, pesos, políticas anti-sybil — permanece **fuera de la cadena** (off-chain), en manos de cada aplicación.

El protocolo está formalizado en 6 specifications:

| RFC | Protocolo | Estado |
|---|---|---|
| RFC-001 | Identidad (NFT inmutable por persona, un solo minteo) | ✅ Implementado |
| RFC-002 | Interacción (capa off-chain con roles explícitos por parte) | ✅ Implementado |
| RFC-003 | Recibo de interacción (firma conjunta A+B → un recibo + 2 Rating Rights) | ✅ Implementado |
| RFC-004 | Calificación 1–5 por participante (la Rating Right se quema al gastarse) | ✅ Implementado |
| RFC-005 | Implementación de referencia BCH (doble modo: Mock / Chipnet real) | 🟡 Prototipo vivo |
| RFC-006 | Indexer (reconstruye hechos desde el hex crudo de las txs) | ✅ Implementado |

RepID ataca tres problemas clásicos de la reputación _sin_ intermediarios:
1. **Identidad única** — imposible de falsificar sin quemar la propia cuenta (el NFT identidad es de un solo uso).
2. **Una calificación por persona por interacción** — garantizado por el consumo del UTXO, sin lógica de covenant extra.
3. **Cold start** — declaraciones unilaterales de confianza (persona → persona) sin consentimiento del otro.

También incluye **confirmaciones de plataforma**: una app puede corroborar on-chain que una interacción ocurrió *sin* necesitar identidad propia.

## Estado actual

[![CI](https://github.com/Mauricio1599/repid/actions/workflows/ci.yml/badge.svg)](https://github.com/Mauricio1599/repid/actions/workflows/ci.yml)

- ✅ **Suite completa**: 67 tests en verde (`npx vitest run`; 48 del protocolo/servidor + 19 end-to-end del servidor).
- ✅ **Modo simulado** (Mock, por defecto) para desarrollar y probar sin red.
- ✅ **Modo red real** (Chipnet, tBCH) con todas las operaciones de red aisladas en un child process.
- ✅ **Validación frente a la VM real de Bitcoin**: corrida E2E en Chipnet (2026-09-10, wallet fondeada con 1.015.000 sats de tBCH) — **11/11 PASS**, los 7 hechos del flujo completo broadcast y verificados on-chain. Detalle y txids en `tasks.md` TASK-026. Reproducible por cualquiera desde el workflow manual **`chipnet-e2e`** de GitHub Actions (TASK-032).

## Arquitectura en una página

```
                    OFF-CHAIN (interpretación)                    ON-CHAIN (hechos, BCH)
┌─────────────────────────────────────┐   ┌──────────────────────────────────────┐
│  Interacción de aplicación (RFC-002)│   │  Identity Genesis (RFC-001)          │
│  Puntaje / reputación (decisión de  │   │  Receipt Genesis (RFC-003/004)       │
│  cada app)                           │   │  Issued Rating 1–5 (RFC-004)        │
│  UI de la demo (server/public)      │   │  Platform Confirmation (RFC-003 RF-06)│
│                                     │   │  Trust Link (RFC-006)                │
└───────▲─────────────────────────────┘   └───────────────▲──────────────────────┘
        │                                                │ raw hex
        │ hechos estructurados                           ▼
        │           ┌─────────────────────────────────────────────┐
        └───────────│  Indexer (RFC-006) — decodeTransactionBCH   │
                    │  store JSON: Rating Rights + Receipts       │
                    └─────────────────────────────────────────────┘
```

Diagrama completo en `diagram/repid-architecture.svg` (abrilo en cualquier navegador).

## Estructura del repositorio

```
├── contracts/            covenants CashScript (identity_genesis, receipt_genesis) + ABI
├── indexer/              indexer RFC-006 (decodifica y reconstruye hechos)
├── interaction/          capa off-chain de interacción (RFC-002)
├── context/              worker aislado para operaciones de red reales (Chipnet)
├── server/               prototipo Express + consola web de dos columnas
├── scripts/              smoke tests (Mock y Chipnet) + E2E Chipnet
├── specs/                SPEC-001 a SPEC-006 (EARS + RFs, cada una con su test)
├── test/                 suite de tests (vitest)
├── diagram/              diagrama de arquitectura (SVG)
├── docs/                 convenciones de diseño, paquete SDD, pitch
├── constitution.md       principios innegociables del proyecto
└── plan.md, tasks.md     diseño técnico y desglose de tareas
```

## Cómo arrancar

Requisitos: **Node.js** (se usa `npm`).

### 1) Modo simulado (Mock) — para probar al instante

```bash
npm install
npm start        # abre http://localhost:3787
```

Cada wallet nace con BCH "de juguete"; todo corre en una red simulada local. La consola incluye una pestaña **«App ejemplo»** con una mini-plataforma de freelance (cliente ⇄ profesional → confirmación de plataforma → calificación → reputación) que corre sobre la API cruda del protocolo.

### 2) Modo red real (Chipnet, tBCH de prueba)

```bash
$env:REPID_NETWORK="chipnet"   # PowerShell
npm start
```

En Chipnet las wallets nacen vacías: hay que pedir tBCH al faucet (manual) y usar el botón **«Saldo»** de la consola / `scripts/chipnet-e2e.mjs` para validar el flujo completo contra la red real. Guía paso a paso para no-programadores en `GUIA_DE_PRUEBAS.md` §7.

### 3) Tests

```bash
npm test             # suite completa del protocolo (67 tests)
npm run test:e2e     # solo el flujo end-to-end del servidor
```

## Más documentación

- **Guía de pruebas manual** (para personas sin programación): `GUIA_DE_PRUEBAS.md`.
- **Pitch de una página**: `docs/PITCH.md`.
- **Specs** (RFCs en formato EARS): `specs/SPEC-*.md`.
- **Convenciones y contexto operativo para agentes de IA**: `constitution.md`, `agents.md`.
- **Documentación interna de planificación**: `docs/PACKAGE-SDD.md`.

## Notas honestas

- El prototipo corre con claves de prueba en memoria (Mock) o persistidas en `data/` (Chipnet, tBCH sin valor) — **no** es una implementación de producción ni contiene wallets reales.
- La validación contra la **VM real de Bitcoin** (que los covenants sean aceptados por la red) **ya se ejecutó**: E2E Chipnet 11/11 PASS el 2026-09-10 (`scripts/chipnet-e2e.mjs`, txids en `tasks.md` TASK-026). La corrida de archivo es reproducible en cualquier momento pidiendo tBCH al faucet.
- **Las identidades son irreversibles**: cada identidad se acuña una sola vez y queda atada a su clave. Si se pierde la clave, la identidad se pierde para siempre (riesgo aceptado en el MVP, decisión TASK-028); custodiar las claves es responsabilidad de cada usuario.
- El proyecto se desarrolla en español/código en inglés; los specs y comunicaciones son en español.