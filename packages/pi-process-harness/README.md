# @danypops/pi-process-harness

Spawns real `pi` processes (and companion daemon processes) for integration
tests that need more than [@danypops/pi-extension-harness](https://github.com/DanyPops/pi-extension-harness)'s
in-process/jiti/mock-cli layers can give: a genuine `AgentSession` deciding,
on its own, to call a tool from a prompt -- not a test hand-feeding a tool
name directly.

## Why this exists

`pi-extension-harness` is explicit about its own boundary: it never boots a
real `AgentSession` or a real LLM. That's the right call for testing one
extension's own callback behavior in isolation, but it means nothing in that
package can prove "a real agent loop, given this prompt, actually calls this
tool" -- or coordinate a companion daemon process (a Vehicle-backed daemon,
for instance) alongside a real Pi process for a true end-to-end test.

This package covers exactly that gap, using Pi's own first-party scriptable
model provider (`@earendil-works/pi-ai`'s `fauxProvider`) so the agent loop's
tool-call decision is real but deterministic -- no live LLM call, no API
spend.

## Usage

```ts
import { spawnRealPiProcess, resolveFauxProviderExtensionPath, encodeFauxScript, SCRIPT_ENV_VAR, waitForRpcEvent } from "@danypops/pi-process-harness";

const proc = spawnRealPiProcess({
  extensions: [resolveFauxProviderExtensionPath(), "/abs/path/to/your/extension.ts"],
  extraArgs: ["--provider", "faux", "--model", "faux-1"],
  env: {
    [SCRIPT_ENV_VAR]: encodeFauxScript([{ type: "toolCall", name: "your_tool", arguments: { foo: "bar" } }]),
  },
});

const events: unknown[] = [];
proc.onEvent((event) => events.push(event));
proc.sendPrompt("go");
await waitForRpcEvent(events, (event) => event.type === "tool_execution_end");
await proc.dispose();
```

The bundled faux extension is payload-lifecycle aware: it wraps Pi AI's faux provider so
`before_provider_request` handlers execute at the real provider stream boundary. Because faux has
no wire protocol, the hook receives a deterministic provider-neutral shape (`system`, `messages`,
`tools`). Payload rewrites are observational only; provider-specific serialization/rewrite tests
still require a local HTTP provider fake.

For a companion daemon (Epi, or any other real process a test needs alongside
the Pi process):

```ts
import { spawnCompanionDaemon } from "@danypops/pi-process-harness";

const daemon = await spawnCompanionDaemon({
  command: "node",
  args: ["dist/cli.js", "serve"],
  isReady: async () => fs.existsSync("/tmp/my-daemon/handle.json"),
});
// ... drive the test ...
await daemon.dispose();
```

## What this does not do

- No OS sandbox: the harness isolates `HOME` and `PI_CODING_AGENT_DIR` by default, but the real
  child still has ordinary filesystem/network access like any `child_process.spawn`.
- No assertion helpers beyond `waitForRpcEvent` -- read the real RPC event
  stream and assert on it directly.
- Not a replacement for `pi-extension-harness` -- use that for fast,
  hermetic, single-extension behavior tests; reach for this only when a test
  genuinely needs a real agent loop or a real companion process.

## License

MIT
