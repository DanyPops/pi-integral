# pi-testing

Test harnesses for [Pi](https://pi.dev) extensions, agent sessions, and TUI components, at
several layers of fidelity: in-process (fast, hermetic), real subprocess (a genuine agent loop),
and real terminal rendering.

## Packages

- **[`packages/pi-extension-harness`](packages/pi-extension-harness)** — in-process test host for
  one extension's own hooks/tools/commands, no real `AgentSession` or LLM. Also a jiti-loader
  layer and a `mock-pi-cli` subprocess mode for production-fidelity load verification.
- **[`packages/pi-process-harness`](packages/pi-process-harness)** — spawns a real `pi` process
  (and companion daemons) for integration tests that need a genuine agent loop deciding, on its
  own, to call a tool — scripted via Pi's own first-party faux model provider, no live LLM call.
- **[`packages/pi-tui-harness`](packages/pi-tui-harness)** — tests real `@earendil-works/pi-tui`
  `Component` instances: named-key input helpers, and a real headless VT state machine
  (`@xterm/headless`) for structured cell/plain-text assertions plus golden-file snapshots,
  instead of a hand-rolled ANSI-stripping regex.
- **[`packages/process-support`](packages/process-support)** — shared process-spawning
  primitives (bounded stderr capture, graceful-then-forceful shutdown, NDJSON line buffering)
  used by `pi-process-harness`; not Pi-specific, published standalone since it's a real runtime
  dependency, not just a dev-time convenience.

Each package picks the cheapest layer that actually proves the behavior in question; reach for
the next one only when a test genuinely needs more than the current layer can give.

## License

MIT
