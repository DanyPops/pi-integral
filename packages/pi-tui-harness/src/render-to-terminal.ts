import { Terminal } from "@xterm/headless";

/** Generous enough that no realistic Component render() line wraps unexpectedly under the default; pass explicit cols for an exact-width assertion. */
const DEFAULT_COLS = 400;

export interface TerminalCell {
	readonly char: string;
	readonly isFgDefault: boolean;
	readonly isBgDefault: boolean;
	/** Present only when the foreground is in ANSI palette color mode (0-255). */
	readonly fgPaletteIndex: number | undefined;
	/** Present only when the background is in ANSI palette color mode (0-255). */
	readonly bgPaletteIndex: number | undefined;
	/** Present only when the foreground is a 24-bit true color (0xRRGGBB). */
	readonly fgRgb: number | undefined;
	/** Present only when the background is a 24-bit true color (0xRRGGBB). */
	readonly bgRgb: number | undefined;
	readonly bold: boolean;
	readonly italic: boolean;
	readonly dim: boolean;
	readonly underline: boolean;
	readonly blink: boolean;
	readonly inverse: boolean;
	readonly invisible: boolean;
	readonly strikethrough: boolean;
}

export interface RenderedTerminal {
	readonly cols: number;
	readonly rows: number;
	/** Trimmed (no trailing whitespace) plain-text content of each row, ANSI already interpreted away by the real VT parser. */
	plainLines(): string[];
	/** Structured attributes for one cell, or undefined if the row itself doesn't exist. A cell past a line's real content is a real empty cell (char === ""), not undefined -- the row exists, that column is just blank. */
	cellAt(row: number, col: number): TerminalCell | undefined;
	dispose(): void;
}

export interface RenderToTerminalOptions {
	readonly cols?: number;
	readonly rows?: number;
}

/**
 * Feeds real ANSI-styled lines (as a Component.render(width) would produce)
 * through @xterm/headless's real VT state machine -- the same engine VS
 * Code's own integrated terminal uses -- instead of a hand-rolled
 * ANSI-stripping regex. Ghostty's libghostty-vt testing philosophy applied
 * to Pi's own TUI layer: don't mock what a real, cheap, battle-tested
 * engine already does correctly.
 */
export async function renderToTerminal(lines: readonly string[], options: RenderToTerminalOptions = {}): Promise<RenderedTerminal> {
	const cols = options.cols ?? DEFAULT_COLS;
	const rows = options.rows ?? Math.max(lines.length, 1);
	const terminal = new Terminal({ cols, rows, convertEol: true, allowProposedApi: true });

	await new Promise<void>((resolve) => {
		terminal.write(lines.join("\n"), resolve);
	});

	function requireLine(row: number) {
		const line = terminal.buffer.active.getLine(row);
		if (!line) throw new Error(`renderToTerminal: row ${row} is out of range (terminal has ${terminal.rows} rows)`);
		return line;
	}

	return {
		cols: terminal.cols,
		rows: terminal.rows,
		plainLines() {
			const result: string[] = [];
			for (let row = 0; row < terminal.rows; row++) {
				result.push(requireLine(row).translateToString(true));
			}
			return result;
		},
		cellAt(row, col) {
			const line = terminal.buffer.active.getLine(row);
			const cell = line?.getCell(col);
			if (!cell) return undefined;
			return {
				char: cell.getChars(),
				isFgDefault: cell.isFgDefault(),
				isBgDefault: cell.isBgDefault(),
				fgPaletteIndex: cell.isFgPalette() ? cell.getFgColor() : undefined,
				bgPaletteIndex: cell.isBgPalette() ? cell.getBgColor() : undefined,
				fgRgb: cell.isFgRGB() ? cell.getFgColor() : undefined,
				bgRgb: cell.isBgRGB() ? cell.getBgColor() : undefined,
				bold: cell.isBold() !== 0,
				italic: cell.isItalic() !== 0,
				dim: cell.isDim() !== 0,
				underline: cell.isUnderline() !== 0,
				blink: cell.isBlink() !== 0,
				inverse: cell.isInverse() !== 0,
				invisible: cell.isInvisible() !== 0,
				strikethrough: cell.isStrikethrough() !== 0,
			};
		},
		dispose() {
			terminal.dispose();
		},
	};
}
