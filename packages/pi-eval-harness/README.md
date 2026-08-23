# @danypops/pi-eval-harness

Scores a real agent run's own tool-call behavior over Pi's real `AgentSessionEvent` stream --
AND/OR tool-call matching, graduated checker composition, and turn/tool-call/token-usage
rollups. Ported from Alef's own `packages/core/eval` evaluation framework, adapted to operate
directly on the real event union any `@danypops/pi-process-harness` (or `pi --mode rpc`) run
already produces, instead of a bespoke OTel span format.

## Usage

```ts
import { deriveTurns, expectsAll, extractToolExecutions, summarizeRunUsage } from "@danypops/pi-eval-harness";

const executions = extractToolExecutions(sessionEvents);
// [{ toolCallId, toolName, args, result, isError }, ...] in completion order

const checker = expectsAll([{ tool: "search_code", target: { pattern: "TODO" } }]);
const result = await checker.check({ executions });
// { pass, score, errors }

const turns = deriveTurns(sessionEvents);
const usage = summarizeRunUsage(turns);
// { turns, tokensIn, tokensOut, cacheReadTokens, costUsd, toolCalls, toolNames }
```

## Scope

- `extractToolExecutions` -- pairs `tool_execution_start`/`tool_execution_end` by `toolCallId`
  into one real completed call per pair, in completion order.
- `matchesToolCall`/`describeToolCall` -- whether one completed execution satisfies a `ToolCall`
  expectation (tool name, target args, produced output), and a human-readable description of it.
- `expectsAll`/`expectsAny`/`all` -- `Checker`s with AND/OR/composed semantics and graduated
  `CheckerResult` scoring (0.0 hard fail, 1.0 full pass).
- `deriveTurns`/`summarizeRunUsage` -- one `Turn` per real `turn_end` event (model, token usage,
  cost, ordered tool-call names), rolled up into whole-run totals.

## Testing your own Checkers: fixture self-test discipline

Ported from Alef's own `Evaluation.fixture`/`FixtureSet` discipline: a `Checker` must be proven
correct against a small, hand-authored, known-good `ToolExecution[]` fixture -- with **zero**
live process spawns or LLM calls -- before it is ever trusted against a real run. This package's
own test suite follows exactly that pattern (see `test/checker.test.ts` and `test/tool-call.test.ts`):
build a `ToolExecution` fixture by hand, call `checker.check({ executions })` directly, assert the
exact `{ pass, score, errors }` you expect. No helper wraps this -- the whole point is that
`Checker.check()` is already a pure, synchronous-or-trivially-awaitable function; wrapping it
would only hide the assertion, not simplify it.

A `Checker` that only ever gets exercised against a real, expensive `pi-process-harness` run has
no fast, deterministic proof it is correct in isolation -- write the fixture test first.

## License

MIT
