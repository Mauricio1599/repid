# RepID — Pitch en una página

## El problema

La reputación hoy vive en manos de plataformas centralizadas: una app decide tu puntaje, puede borrarlo, y vos no podés llevarte tu historial a ningún lado. Las alternativas descentralizadas existentes sufren dos males clásicos: **fake identities** (cualquiera crea cuentas infinitas para inflar su puntaje) y **cold start** (nadie tiene historia cuando empieza).

## La idea

RepID es un **protocolo de reputación sobre Bitcoin Cash** que usa los *CashTokens* (NFTs nativos) para anclar **hechos inmutables** en la cadena, y deja **toda la interpretación fuera de la cadena**:

- **Identidad** — un NFT de un solo uso por persona. Falsificarla exige quemar la propia cuenta.
- **Interacción + recibo** — dos personas registran juntas una interacción (firma de ambos): nace un *recibo* y dos *derechos de calificación* (Rating Rights).
- **Calificación 1–5** — cada parte califica a la otra *una sola vez por interacción*; el derecho se quema al usarse. Garantizado por el protocolo, sin intermediarios.
- **Confirmación de plataforma** — una app puede corroborar on-chain que una interacción ocurrió, sin necesitar identidad propia.
- **Trust Link** — declaración unilateral de confianza persona → persona, para atacar el cold start.

El resultado: una **reputación portable, auditable hasta la transacción que la produjo, y resistente a sibylling** — porque las pruebas de identidad y de unicidad de voto son on-chain y no se pueden inventar.

## Por qué Bitcoin Cash

- **CashTokens**: NFTs con restricciones verificables por script (el *covenant*), bidireccionalmente compatibles con el BCH existente, sin smart contracts de segunda capa.
- Comisiones de **centavos**: apto para que cada calificación sea una transacción sin costos prohibitivos.
- Filosofía "**capas**": la cadena como capa de hechos; cada app construye su propia capa de interpretación. RepID no le dicta a nadie cómo ponderar.

## Estado actual

- Protocolo formalizado en **6 specs** (RFC-001 a RFC-006) y **67 tests en verde, incluye 19 E2E**.
- **Prototipo funcional completo**: covenants CashScript + indexer + consola web en vivo (demo de un clic).
- **Doble modo**: red simulada (para que cualquiera lo pruebe al instante) y **red real de pruebas Chipnet** (tBCH) con operaciones de red aisladas de forma segura.
- Validación definitiva ante la **VM real de Bitcoin** en curso (una corrida E2E en cuanto una wallet de prueba reciba tBCH).

## Qué buscamos

1. **Colaboradores técnicos** — para robustecer el prototipo, escribir la app de ejemplo sobre el protocolo y preparar la implementación de producción.
2. **Financiamiento temprano** — para continuar el desarrollo con horizonte de semanas (desarrollo individual hoy).

## Cómo verlo

```bash
npm install && npm start    # abre http://localhost:3787
```

Un clic en **«Reproducir demo»** genera todo el flujo: 3 personas, identidad, interacciones, calificaciones, confirmación y confianza. Guía completa en `GUIA_DE_PRUEBAS.md`.

---

*Proyecto más información y specs: `README.md`, `specs/`, `AGENTS.md`.*