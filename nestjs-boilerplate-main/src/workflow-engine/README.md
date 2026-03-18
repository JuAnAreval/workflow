# Workflow Engine (Backend)

## Objetivo
Este módulo concentra la ejecución de workflows (runtime, scheduler y facade) y evita que la lógica de ejecución quede mezclada en `projects`.

## Estructura
- `contracts/`: tipos y puertos públicos internos del engine.
- `core/workflow-engine-runtime.service.ts`: runtime principal de ejecución de nodos.
- `core/workflow-execution.engine.ts`: clase inyectable del engine usada por facade.
- `core/workflow-scheduler.service.ts`: scheduler de disparos programados.
- `facade/workflow-engine-facade.service.ts`: entrada única para consumidores externos.
- `workflow-engine.module.ts`: módulo DI del engine.

## Configuración por entorno
- `WORKFLOW_EXECUTION_LOGS`: `false` para apagar logs estructurados por ejecución (default: encendido).
- `WORKFLOW_MAX_EXECUTION_STEPS`: máximo de nodos ejecutados por corrida (default: `500`, rango `10-10000`).
- `WORKFLOW_HTTP_TIMEOUT_MS`: timeout HTTP para nodo request (default: `15000`, rango `1000-120000`).
- `WORKFLOW_JS_TIMEOUT_MS`: timeout para nodo JavaScript VM (default: `120`, rango `10-10000`).
- `WORKFLOW_SCHEDULER_LOGS`: `false` para apagar logs del scheduler.

## Logs estructurados
El runtime registra eventos JSON:
- `workflow.execution.start`
- `workflow.execution.node`
- `workflow.execution.finish`

Campos clave:
- `executionId`
- `workflowId`
- `phase` (`run` o `resume`)
- `nodeId`, `nodeType`, `outcome`, `routeKey`, `durationMs`

## Integración actual
- `ProjectWorkflowAutomationService` sigue siendo la fachada de compatibilidad.
- La ejecución real corre en `workflow-engine`.

## Siguiente paso recomendado
Partir `workflow-engine-runtime.service.ts` en handlers por `node.type` (`decision_*`, `action_http_request`, `action_javascript_code`, etc.) para reducir tamaño y facilitar mantenimiento.
