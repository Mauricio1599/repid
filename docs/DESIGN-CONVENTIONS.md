# DESIGN-CONVENTIONS.md — Convenciones Visuales

Aplican al servidor prototipo (consola web de dos columnas), a cualquier UI futura, y al diagrama de arquitectura.

## Paleta y fondo

- **Fondo tinta oscuro (dark ink):** refuerza conceptualmente la idea de inmutabilidad on-chain.
- **Color de señal: bronce/latón (brass/bronze):** usado para resaltar elementos activos o hechos on-chain relevantes.

## Tipografía

- **Fraunces** — tipografía de display (títulos).
- **IBM Plex Sans** — tipografía de interfaz (UI general).
- **IBM Plex Mono** — reservada **estrictamente** para datos on-chain (hashes, hex, categorías de token, outpoints). No usar para texto de interfaz general ni para prosa.

## Convenciones del Diagrama de Arquitectura

- Los colores de los puntos (dots) del diagrama deben coincidir con los indicadores de "hechos" (facts) usados en el frontend de la consola — consistencia visual entre el diagrama conceptual y la UI real.
- **Círculo hueco** = Rating Right no gastado (vivo).
- **Círculo relleno** = hecho terminal / UTXO ya gastado.

## Nota de Sincronización

Estas convenciones se aplicaron ya en el diagrama SVG producido en una sesión previa (no incluido en este paquete — ver `agents.md`, sección 10). Cualquier diagrama o pieza de UI nueva debe respetar estas mismas reglas para mantener consistencia visual entre el "mundo conceptual" (diagrama) y el "mundo real" (consola web).
