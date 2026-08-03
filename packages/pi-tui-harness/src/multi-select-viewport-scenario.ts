import type { Component } from "@earendil-works/pi-tui";
import { driveComponent } from "./drive-component.js";
import { renderToTerminal } from "./render-to-terminal.js";

const DEFAULT_WIDTH = 80;
const DEFAULT_DOWN_PRESSES = 4;
const DEFAULT_MAX_FRAME_ROWS = 200;

export interface MultiSelectViewportScenarioOptions {
	readonly component: Component;
	readonly width?: number;
	readonly downPresses?: number;
	readonly maxFrameRows?: number;
}

export interface MultiSelectViewportScenarioFrames {
	readonly initial: readonly string[];
	readonly focusedBeyondViewport: readonly string[];
	readonly checked: readonly string[];
	readonly unchecked: readonly string[];
	readonly returnedToStart: readonly string[];
}

/**
 * Drives the production regression path while leaving state assertions to the component's owner.
 * Pure model tests should cover navigation rules; this helper is the thin key/render/VT integration check.
 */
export async function runMultiSelectViewportScenario(
	options: MultiSelectViewportScenarioOptions,
): Promise<MultiSelectViewportScenarioFrames> {
	const width = Math.max(1, Math.floor(options.width ?? DEFAULT_WIDTH));
	const downPresses = Math.max(1, Math.floor(options.downPresses ?? DEFAULT_DOWN_PRESSES));
	const maxFrameRows = Math.max(1, Math.floor(options.maxFrameRows ?? DEFAULT_MAX_FRAME_ROWS));
	const driven = driveComponent(options.component);

	const capture = async (): Promise<readonly string[]> => {
		const frame = driven.render(width);
		if (frame.length > maxFrameRows) throw new Error(`component frame exceeds ${maxFrameRows} rows`);
		const terminal = await renderToTerminal(frame, { cols: width, rows: Math.max(1, frame.length) });
		try {
			return terminal.plainLines();
		} finally {
			terminal.dispose();
		}
	};

	const initial = await capture();
	driven.pressKeys(Array.from({ length: downPresses }, () => "down"));
	const focusedBeyondViewport = await capture();
	driven.pressKey("space");
	const checked = await capture();
	driven.pressKey("space");
	const unchecked = await capture();
	driven.pressKeys(Array.from({ length: downPresses }, () => "up"));
	const returnedToStart = await capture();

	return { initial, focusedBeyondViewport, checked, unchecked, returnedToStart };
}
