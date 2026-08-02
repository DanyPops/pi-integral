# pi-testing

Test harnesses for [Pi](https://pi.dev) extensions and agent sessions, at three layers of
fidelity: in-process (fast, hermetic), real subprocess (a genuine agent loop), and (planned)
real terminal rendering.

## Packages

- **[`packages/pi-extension-harness`](packages/pi-extension-harness)** — in-process test host for
  one extension's own hooks/tools/commands, no real `AgentSession` or LLM. Also a jiti-loader
  layer and a `mock-pi-cli` subprocess mode for production-fidelity load verification.
- **[`packages/pi-process-harness`](packages/pi-process-harness)** — spawns a real `pi` process
  (and companion daemons) for integration tests that need a genuine agent loop deciding, on its
  own, to call a tool — scripted via Pi's own first-party faux model provider, no live LLM call.
- **`packages/pi-tui-harness`** (planned) — testing terminal-rendering `Component`s against a
  real headless VT state machine instead of hand-parsed ANSI, plus golden-snapshot comparison.

Each package picks the cheapest layer that actually proves the behavior in question; reach for
the next one only when a test genuinely needs more than the current layer can give.

## License

MIT
