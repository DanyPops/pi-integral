# @danypops/pi-tui-harness

Tests real [`@earendil-works/pi-tui`](https://www.npmjs.com/package/@earendil-works/pi-tui)
`Component` instances without a hand-rolled ANSI-stripping regex. Applies
Ghostty's `libghostty-vt` testing philosophy (Mitchell Hashimoto: "isolate
side effects, use a real engine for the rest") to Pi's own TUI layer.

Three layers, in order of speed and coverage:

1. **`driveComponent`** -- fast, in-process, named-key input helpers. No
   terminal, no ANSI interpretation, just direct `handleInput()` calls with
   real legacy byte sequences (cross-checked against `@earendil-works/pi-tui`'s
   own `matchesKey`).
2. **`renderToTerminal`** -- feeds a component's real `render()` output
   through [`@xterm/headless`](https://www.npmjs.com/package/@xterm/headless)
   (the same VT engine VS Code's integrated terminal uses) for structured
   `plainLines()`/`cellAt()` assertions -- real bold/underline/color
   interpretation, not regex guesses.
3. **`expectSnapshot`** -- golden-file snapshot testing for a captured
   frame. "One frame in, one frame out": tightly control the input state,
   run one render pass, diff the result against a known-good copy.

`runMultiSelectViewportScenario` supplies the thin production regression path
for a four-row multi-select: move to the fifth row, toggle it twice, then move
back to the first row. Component owners keep navigation rules in pure model
tests and assert this helper's VT-interpreted frames at the integration layer.

A real subprocess/`node-pty` layer (an actual terminal emulator, real
keyboard-driver-level input) is deliberately out of scope for now --
`driveComponent` + `renderToTerminal` already cover unit and structural
assertions; a future fourth layer would only add value for behavior that
depends on a real pty (resize signals, real terminal capability detection).

## Install

```
npm install --save-dev @danypops/pi-tui-harness @earendil-works/pi-tui
```

## Example

```ts
import { driveComponent, renderToTerminal, expectSnapshot } from "@danypops/pi-tui-harness";
import { MyComponent } from "../src/my-component.js";

const component = new MyComponent();
const driven = driveComponent(component);

driven.pressKey("down");
driven.pressKey("space");

// Layer 2: real VT interpretation, structured cell assertions.
const terminal = await renderToTerminal(driven.render(40));
expect(terminal.plainLines()[0]).toBe("[x] selected item");
expect(terminal.cellAt(0, 0)?.bold).toBe(true);
terminal.dispose();

// Layer 3: golden-file snapshot of one captured frame.
expectSnapshot("test/__snapshots__/my-component.snap", terminal.plainLines());
```

Set `UPDATE_SNAPSHOTS=1` to accept a new golden file after an intentional
rendering change.
