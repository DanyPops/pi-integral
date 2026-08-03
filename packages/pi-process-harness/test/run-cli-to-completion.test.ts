import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CliOutputLimitError, runCliToCompletion } from "../src/run-cli-to-completion.js";

const tempDirs: string[] = [];

afterEach(() => {
	for (const directory of tempDirs.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("runCliToCompletion", () => {
	it("collects stdout, stderr, and the exit code from a real process", async () => {
		const result = await runCliToCompletion("bun", ["-e", 'console.log("ready"); console.error("note"); process.exit(7)']);
		expect(result).toEqual({ code: 7, stdout: "ready\n", stderr: "note\n", attempts: 1 });
	});

	it("restarts a command whose first completed attempt produces empty output", async () => {
		const directory = mkdtempSync(join(tmpdir(), "pi-cli-retry-"));
		tempDirs.push(directory);
		const marker = join(directory, "attempted");
		const script = `
			import { existsSync, writeFileSync } from "node:fs";
			const marker = process.argv[1];
			if (!existsSync(marker)) writeFileSync(marker, "1");
			else console.log("second attempt");
		`;
		const result = await runCliToCompletion("bun", ["-e", script, marker]);
		expect(existsSync(marker)).toBe(true);
		expect(result).toEqual({ code: 0, stdout: "second attempt\n", stderr: "", attempts: 2 });
	});

	it("bounds each captured output stream", async () => {
		await expect(runCliToCompletion("bun", ["-e", 'console.log("12345")'], { maxOutputBytes: 4 })).rejects.toBeInstanceOf(
			CliOutputLimitError,
		);
	});
});
