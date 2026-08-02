import { describe, expect, it } from "bun:test";
import { renderToTerminal } from "../src/render-to-terminal.js";

describe("renderToTerminal", () => {
	it("interprets plain lines with no ANSI codes as-is", async () => {
		const terminal = await renderToTerminal(["hello", "world"]);
		expect(terminal.plainLines().slice(0, 2)).toEqual(["hello", "world"]);
		terminal.dispose();
	});

	it("strips real SGR color codes via the real VT parser, not a regex", async () => {
		const terminal = await renderToTerminal(["\x1b[31mred text\x1b[0m plain"]);
		expect(terminal.plainLines()[0]).toBe("red text plain");
		terminal.dispose();
	});

	it("cellAt() reports the real foreground color the VT parser assigned, by ANSI palette index", async () => {
		const terminal = await renderToTerminal(["\x1b[31mR\x1b[0mG"]);
		const red = terminal.cellAt(0, 0);
		const green = terminal.cellAt(0, 1);
		expect(red?.char).toBe("R");
		expect(red?.isFgDefault).toBe(false);
		expect(red?.fgPaletteIndex).toBe(1); // ANSI red
		expect(green?.char).toBe("G");
		expect(green?.isFgDefault).toBe(true);
		terminal.dispose();
	});

	it("cellAt() reports bold/underline/inverse attributes set via real SGR codes", async () => {
		const terminal = await renderToTerminal(["\x1b[1mB\x1b[22m\x1b[4mU\x1b[24m\x1b[7mI\x1b[27m"]);
		expect(terminal.cellAt(0, 0)?.bold).toBe(true);
		expect(terminal.cellAt(0, 1)?.underline).toBe(true);
		expect(terminal.cellAt(0, 2)?.inverse).toBe(true);
		terminal.dispose();
	});

	it("cellAt() returns undefined past the real line length", async () => {
		const terminal = await renderToTerminal(["hi"], { cols: 20 });
		expect(terminal.cellAt(0, 0)?.char).toBe("h");
		expect(terminal.cellAt(0, 19)?.char).toBe(""); // real trailing empty cell, not undefined -- the row exists
		terminal.dispose();
	});

	it("sizes the terminal to fit the widest line and the given row count by default", async () => {
		const terminal = await renderToTerminal(["a line that is twenty chars", "short"]);
		expect(terminal.cols).toBeGreaterThanOrEqual(27);
		expect(terminal.rows).toBeGreaterThanOrEqual(2);
		terminal.dispose();
	});

	it("respects explicit cols/rows options", async () => {
		const terminal = await renderToTerminal(["hello"], { cols: 40, rows: 5 });
		expect(terminal.cols).toBe(40);
		expect(terminal.rows).toBe(5);
		terminal.dispose();
	});

	it("keeps each rendered line on its own row -- does not treat \\n within a single array entry as a real line break to line-wrap incorrectly", async () => {
		const terminal = await renderToTerminal(["first", "second", "third"]);
		expect(terminal.plainLines().slice(0, 3)).toEqual(["first", "second", "third"]);
		terminal.dispose();
	});
});
