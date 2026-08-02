import type { Component } from "@earendil-works/pi-tui";

const BOLD_INVERSE = "\x1b[1;7m";
const RESET = "\x1b[0m";
const DIM = "\x1b[2m";

/**
 * A small real Component fixture (not a mock of one): an up/down-navigable,
 * space-toggleable checklist. Renders real SGR styling (bold+inverse for
 * the selected row, dim for a disabled row) -- exactly the kind of output
 * a hand-rolled stripAnsi() regex would previously have had to interpret.
 */
export class ToggleListComponent implements Component {
	private selectedIndex = 0;
	private readonly checked: boolean[];

	constructor(
		private readonly items: readonly string[],
		private readonly disabledIndices: ReadonlySet<number> = new Set(),
	) {
		this.checked = items.map(() => false);
	}

	render(_width: number): string[] {
		return this.items.map((item, index) => {
			const box = this.checked[index] ? "[x]" : "[ ]";
			const line = `${box} ${item}`;
			if (this.disabledIndices.has(index)) return `${DIM}${line}${RESET}`;
			if (index === this.selectedIndex) return `${BOLD_INVERSE}${line}${RESET}`;
			return line;
		});
	}

	handleInput(data: string): void {
		if (data === "\x1b[A") {
			this.selectedIndex = Math.max(0, this.selectedIndex - 1);
		} else if (data === "\x1b[B") {
			this.selectedIndex = Math.min(this.items.length - 1, this.selectedIndex + 1);
		} else if (data === " " && !this.disabledIndices.has(this.selectedIndex)) {
			this.checked[this.selectedIndex] = !this.checked[this.selectedIndex];
		}
	}

	invalidate(): void {}

	get checkedItems(): string[] {
		return this.items.filter((_, index) => this.checked[index]);
	}
}
