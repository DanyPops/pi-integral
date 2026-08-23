# @danypops/pi-eval-harness

Scores a real agent run's own tool-call behavior over Pi's real `AgentSessionEvent` stream --
AND/OR tool-call matching, graduated checker composition, and turn/tool-call/token-usage
rollups. Ported from Alef's own `packages/core/eval` evaluation framework, adapted to operate
directly on the real event union any `@danypops/pi-process-harness` (or `pi --mode rpc`) run
already produces, instead of a bespoke OTel span format.

## Usage

```ts
import { extractToolExecutions } from "@danypops/pi-eval-harness";

const executions = extractToolExecutions(sessionEvents);
// [{ toolCallId, toolName, args, result, isError }, ...] in completion order
```

## Scope

- `extractToolExecutions` -- pairs `tool_execution_start`/`tool_execution_end` by `toolCallId`
  into one real completed call per pair, in completion order. A start with no matching end (a
  call still in flight or aborted) is dropped.

More to come: `ToolCall`/`expects`/`expectsAny` matching and `Checker` composition, and
turn/token-usage rollups -- see this repo's own task tracker for the rest of this package's
build-out.

## License

MIT
