import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export class SnapshotMismatchError extends Error {
	constructor(
		readonly path: string,
		readonly expected: string,
		readonly actual: string,
	) {
		super(
			`Snapshot mismatch at ${path}\n\n--- expected (golden file) ---\n${expected}\n\n--- actual ---\n${actual}\n\n` +
				"Re-run with UPDATE_SNAPSHOTS=1 to accept the new content, if it's correct.",
		);
		this.name = "SnapshotMismatchError";
	}
}

/**
 * Golden-file snapshot assertion: compares `content` against the file at
 * `path`, creating it on first run. Set UPDATE_SNAPSHOTS=1 to (re)write the
 * golden file unconditionally instead of comparing -- the standard escape
 * hatch for an intentional rendering change. One frame in, one frame out:
 * Mitchell Hashimoto's "full render pass with snapshot testing" -- tightly
 * control the input state, run one render pass, grab exactly one frame,
 * diff it against a known-good copy.
 */
export function expectSnapshot(path: string, content: string | readonly string[]): void {
	const text = Array.isArray(content) ? content.join("\n") : (content as string);

	if (process.env["UPDATE_SNAPSHOTS"] === "1" || !existsSync(path)) {
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, text);
		return;
	}

	const expected = readFileSync(path, "utf-8");
	if (expected !== text) throw new SnapshotMismatchError(path, expected, text);
}
