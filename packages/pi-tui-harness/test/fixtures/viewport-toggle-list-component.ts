import type { Component } from "@earendil-works/pi-tui";

const VISIBLE_ROWS = 4;

/** Minimal real Component fixture for the harness's focus-following viewport scenario. */
export class ViewportToggleListComponent implements Component {
	private focusedIndex = 0;
	private viewportStart = 0;
	private readonly checked = new Set<number>();

	constructor(private readonly items: readonly string[]) {}

	render(_width: number): string[] {
		return this.items.slice(this.viewportStart, this.viewportStart + VISIBLE_ROWS).map((item, offset) => {
			const index = this.viewportStart + offset;
			return `${index === this.focusedIndex ? "→" : " "} ${index + 1}. ${this.checked.has(index) ? "[✓]" : "[ ]"} ${item}`;
		});
	}

	handleInput(data: string): void {
		if (data === "\x1b[B") this.focusedIndex = Math.min(this.items.length - 1, this.focusedIndex + 1);
		else if (data === "\x1b[A") this.focusedIndex = Math.max(0, this.focusedIndex - 1);
		else if (data === " ") {
			if (this.checked.has(this.focusedIndex)) this.checked.delete(this.focusedIndex);
			else this.checked.add(this.focusedIndex);
		}
		this.viewportStart = Math.min(this.viewportStart, this.focusedIndex);
		this.viewportStart = Math.max(this.viewportStart, this.focusedIndex - VISIBLE_ROWS + 1);
	}

	invalidate(): void {}
}
