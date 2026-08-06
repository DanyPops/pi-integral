# @danypops/pi-extension-harness

A lightweight, in-process test host for [Pi](https://pi.dev) extensions.
Analogous to ESLint's `RuleTester`: unit-test hooks, tools, and commands
without booting a real `AgentSession`, an LLM, or any I/O — instead of every
extension author hand-rolling their own fake `ExtensionAPI`.

## Install

```bash
bun add -d @danypops/pi-extension-harness
```

## Why this exists

Testing a Pi extension usually means one of:

- A hand-rolled fake `ExtensionAPI` object, re-written slightly differently
  in every project (`{ registerTool: (t) => tools.push(t), on: ... }`) —
  easy to get subtly wrong, and each project's version drifts from the
  others'.
- Real `pi -e ./src/index.ts --print "..."` invocations — slow, coupled to
  whatever's on the machine (a real daemon, real ambient env vars, real
  global settings), and not something a CI pipeline should depend on.

This package is the shared, well-tested middle ground: a real `ExtensionAPI`/
`ExtensionContext` stub, plus a loader that exercises Pi's actual jiti-based
production load path — so a bug that only manifests under jiti (not under a
plain `import`) still gets caught in a fast, hermetic unit test.

## Three layers

**1. `createExtensionHarness` — pure in-process behavior testing.**
Fastest layer. No jiti involved unless you use layer 2 alongside it.

```ts
import { createExtensionHarness } from "@danypops/pi-extension-harness";
import myExtension from "../src/index.ts";

const h = createExtensionHarness(myExtension, { cwd: "/tmp/workspace" });
await h.boot(); // fires session_start

const result = await h.invokeTool("my_tool", { file: "src/foo.ts" });
expect(h.activeTools).toContain("my_tool");
expect(h.notifications[0]).toEqual({ message: "connected", type: "info" });
expect(h.leaks).toHaveLength(0); // catches direct console.log/stdout writes

await h.shutdown(); // fires session_shutdown, clears state
```

**2. `loadExtensionViaJiti` — the same harness, loaded through jiti.**
Catches real jiti/Bun-CJS-interop bugs (a `Map`/`Set` constructed inside a
jiti-transformed module can fail `instanceof` checks against the same class
constructed natively — a real, previously-hit bug class) before the
extension ever reaches a real Pi session.

```ts
import { loadExtensionViaJiti, createExtensionHarness } from "@danypops/pi-extension-harness";

const factory = await loadExtensionViaJiti("/abs/path/to/src/index.ts");
const h = createExtensionHarness(factory);
await h.boot();
expect(h.tools.has("my_tool")).toBe(true);
```

Pass `nativeModules` to control which packages jiti loads natively instead
of transforming (defaults to `JITI_NATIVE_MODULES`, the same list Pi's own
production loader uses — vendored here since Pi doesn't export it publicly).

**3. `mock-pi-cli` — full production-fidelity E2E, as a real subprocess.**
For the rare case that needs the *other* jiti mode (`tryNative:true`, the
Node ESM baseline Pi's own binary uses in some contexts) or genuine process
isolation (e.g. testing daemon auto-spawn without touching the operator's
real `$XDG_*` state).

```ts
import { spawn } from "node:child_process";
import { createRequire } from "node:module";

const cli = createRequire(import.meta.url).resolve("@danypops/pi-extension-harness/mock-pi-cli");
const proc = spawn("node", [
  cli,
  "--extension", "/abs/path/to/src/index.ts",
  "--tool", "my_tool",
  "--params", JSON.stringify({ file: "src/foo.ts" }),
  "--env", "XDG_RUNTIME_DIR=/tmp/isolated-run",
]);
// proc emits NDJSON events on stdout: tool_execution_start / _end / _error, exit
```

`--tool` is optional. Omit it for a headless "does this extension even
load" check -- the real use case being a package manager validating an
extension before committing to install it, in a real isolated subprocess
rather than assuming a clean `import` means anything under jiti:

```ts
const proc = spawn("node", [cli, "--extension", "/abs/path/to/candidate/index.ts"]);
// emits exactly one of, then exits 0/1 to match:
//   { type: "load_ok" }
//   { type: "load_error", error: "..." }
```

## What the harness stubs

`ctx.ui.notify`, `sendUserMessage`, `registerCommand` handlers,
`setActiveTools`, and every lifecycle event via `pi.on(...)` + `h.emit(...)`
are all real, observable state — inspect `h.notifications`, `h.userMessages`,
`h.commands`, `h.activeTools` directly. `pi.exec()` is stubbable via the
`exec` option for extensions that shell out. Env var overrides passed via
`env` are applied for `boot()..shutdown()` and restored after.

`pi.events` is a real `EventBus` (Pi's own `createEventBus()`), not a second
hand-rolled stub — extensions using the shared cross-extension bus need no
additional fake.

`ctx` is typed as `ExtensionCommandContext` (a superset of `ExtensionContext`
with `waitForIdle`/`newSession`/`fork`/`navigateTree`/`switchSession`/`reload`/
`getSystemPromptOptions`, all safe never-cancelled/no-op stubs by default) so
the same `h.ctx` works for a `pi.on(...)` event handler and a
`pi.registerCommand(...)` handler's ctx alike — no separate
`ExtensionCommandContext` fake needed for command-handler tests.

`ctx.ui.confirm`/`ctx.ui.input` are configurable via the `confirm`/`input`
options: a fixed value answers every call the same way, or a function
receives the real title/message/placeholder for scenario-specific answers
(e.g. deciding by title text, or queuing a sequence of typed values).
`ctx.ui.custom` has no meaningful generic default (it normally drives a live
TUI component), so the `custom` option hands the raw `factory` straight to
your own implementation — call it with fixture args, drive the returned
component, and return whatever the scenario needs `custom()` to resolve
with.

```ts
const h = createExtensionHarness(myExtension, {
  confirm: (title) => title.includes("recovery"),
  input: () => queuedInputs.shift(),
  custom: (factory) => {
    const component = factory(tui, theme, keybindings, done);
    return component.render(80).join("\n");
  },
});
```

## License

MIT
