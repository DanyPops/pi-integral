import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import { driveComponent } from "../src/drive-component.js";
import { renderToTerminal } from "../src/render-to-terminal.js";
import { expectSnapshot } from "../src/snapshot.js";
import { ToggleListComponent } from "./fixtures/toggle-list-component.js";

const snapshotDir = fileURLToPath(new URL("./__snapshots__", import.meta.url));

describe("ToggleListComponent (all three harness layers together)", () => {
	it("layer 1 (driveComponent): navigating and toggling changes real component state, no ANSI involved", () => {
		const component = new ToggleListComponent(["apples", "bananas", "cherries"]);
		const driven = driveComponent(component);

		driven.pressKey("down");
		driven.pressKey("space");
		expect(component.checkedItems).toEqual(["bananas"]);

		driven.pressKeys(["up", "space"]); // back to apples, toggle it too
		expect(component.checkedItems).toEqual(["apples", "bananas"]);
	});

	it("layer 2 (renderToTerminal): asserts on real interpreted structure -- selection is bold+inverse, disabled is dim -- not a stripAnsi() regex guess", async () => {
		const component = new ToggleListComponent(["apples", "bananas"], new Set([1]));
		const driven = driveComponent(component);

		const terminal = await renderToTerminal(driven.render(40));
		expect(terminal.plainLines().slice(0, 2)).toEqual(["[ ] apples", "[ ] bananas"]);

		const selectedCell = terminal.cellAt(0, 0);
		expect(selectedCell?.bold).toBe(true);
		expect(selectedCell?.inverse).toBe(true);

		const disabledCell = terminal.cellAt(1, 0);
		expect(disabledCell?.dim).toBe(true);
		expect(disabledCell?.bold).toBe(false);

		terminal.dispose();
	});

	it("layer 2 tracks real state changes across a real re-render after driven input", async () => {
		const component = new ToggleListComponent(["apples", "bananas"]);
		const driven = driveComponent(component);

		driven.pressKey("down");
		driven.pressKey("space");

		const terminal = await renderToTerminal(driven.render(40));
		expect(terminal.plainLines().slice(0, 2)).toEqual(["[ ] apples", "[x] bananas"]);
		expect(terminal.cellAt(1, 0)?.bold).toBe(true); // now-selected row 1 is bold+inverse
		expect(terminal.cellAt(0, 0)?.bold).toBe(false); // no-longer-selected row 0 is plain
		terminal.dispose();
	});

	it("layer 3 (expectSnapshot): a real render's plain-text output matches a golden file, one frame captured and diffed", async () => {
		const component = new ToggleListComponent(["apples", "bananas", "cherries"]);
		const driven = driveComponent(component);
		driven.pressKeys(["down", "space", "down", "space"]);

		const terminal = await renderToTerminal(driven.render(40));
		expectSnapshot(`${snapshotDir}/toggle-list-checked-two.snap`, terminal.plainLines().slice(0, 3));
		terminal.dispose();
	});
});
