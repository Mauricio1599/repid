# Insumos SDD — RepID

> **Nota de organización**: este documento era el `README.md` de la raíz cuando el repo era solo el paquete de planificación. Se movió a `docs/` cuando el prototipo vivo pasó a ser el repositorio principal. El README de la raíz es ahora la presentación del proyecto.

Este paquete contiene todos los artefactos de Spec Driven Development para RepID, siguiendo el *Manual de Estándares SDD*. Nivel de compromiso elegido: **Spec Anchored** (el recomendado por el manual) — código y especificación deben mantenerse sincronizados en ambas direcciones a medida que el proyecto avance.

## Contenido

```
repid-sdd/
├── agents.md                                  ← contexto operativo para cualquier agente de IA (léelo primero)
├── constitution.md                            ← principios innegociables del proyecto
├── plan.md                                     ← diseño técnico (RFC-005 + RFC-006)
├── tasks.md                                    ← desglose atómico de tareas (20-30 min c/u)
├── HANDOFF-NOTES.md                            ← ⚠️ leer si este paquete es lo único que le vas a dar a la IA
├── specs/
│   ├── SPEC-001-identity-protocol.md           ← RFC-001
│   ├── SPEC-002-interaction-protocol.md        ← RFC-002 (pendiente de implementar)
│   ├── SPEC-003-interaction-receipt-protocol.md← RFC-003
│   └── SPEC-004-rating-protocol.md             ← RFC-004
└── docs/
    └── DESIGN-CONVENTIONS.md                   ← convenciones visuales (frontend + diagrama)
```

> ⚠️ **Importante:** este paquete es solo la capa de planificación. Si lo vas a usar como único insumo para una IA (sin darle también el código real ni esta conversación), leé primero `HANDOFF-NOTES.md` — ahí está detallado qué más conviene adjuntar.

## Cómo usar esto sin programar

1. **Copiá esta carpeta a la raíz de tu repo** (o subila junto al proyecto en Claude Code / la Playground).
2. Cuando le pidas a un agente de IA que siga trabajando en RepID, decile explícitamente: *"leé agents.md y constitution.md antes de tocar nada"*. Eso le da el contexto completo sin que vos tengas que repetirlo cada vez.
3. Antes de cada sesión de implementación, resolvé primero la **Sección A de `tasks.md`** (las asunciones de diseño pendientes). Son decisiones tuyas, no del agente — el agente no debe resolverlas solo.
4. Para cada tarea de la Sección B, pedile al agente que trabaje en **Modo Plan** primero (que te explique la estrategia antes de tocar código), y que al terminar te muestre el resultado real de los tests — no un resumen de que "ya funciona".
5. Tu forma de validar el trabajo no es leer el código: es (a) releer la `spec.md` correspondiente, (b) ver los tests correr, (c) probar el prototipo funcionando. Así está diseñado el flujo (`constitution.md`, Artículo 8).

## Qué falta decidir vos (no lo resuelvas con el agente sin pensarlo)

Las asunciones marcadas con ⚠️ en las specs y listadas en `tasks.md` son las únicas decisiones de arquitectura genuinamente abiertas hoy. Todo lo demás ya está especificado con suficiente precisión como para que un agente lo implemente siguiendo EARS sin ambigüedad.