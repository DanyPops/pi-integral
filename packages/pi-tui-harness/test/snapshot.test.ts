import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectSnapshot, SnapshotMismatchError } from "../src/snapshot.js";

let dir: string | undefined;

afterEach(() => {
	if (dir) rmSync(dir, { recursive: true, force: true });
	dir = undefined;
	delete process.env["UPDATE_SNAPSHOTS"];
});

describe("expectSnapshot", () => {
	it("creates a new golden file on first run and passes", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "first.snap");
		expectSnapshot(file, "line one\nline two");
		expect(existsSync(file)).toBe(true);
		expect(readFileSync(file, "utf-8")).toBe("line one\nline two");
	});

	it("passes silently when the content matches an existing golden file", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "match.snap");
		writeFileSync(file, "same content");
		expect(() => expectSnapshot(file, "same content")).not.toThrow();
	});

	it("throws SnapshotMismatchError with both contents when they differ, and does not modify the golden file", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "mismatch.snap");
		writeFileSync(file, "expected content");
		expect(() => expectSnapshot(file, "actual content")).toThrow(SnapshotMismatchError);
		expect(readFileSync(file, "utf-8")).toBe("expected content");
	});

	it("includes the file path and a diff-friendly message in the thrown error", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "mismatch.snap");
		writeFileSync(file, "expected");
		try {
			expectSnapshot(file, "actual");
			throw new Error("expected expectSnapshot to throw");
		} catch (error) {
			expect(error).toBeInstanceOf(SnapshotMismatchError);
			expect(String(error)).toContain(file);
		}
	});

	it("overwrites the golden file when UPDATE_SNAPSHOTS=1 is set, even on a mismatch", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "update.snap");
		writeFileSync(file, "old content");
		process.env["UPDATE_SNAPSHOTS"] = "1";
		expect(() => expectSnapshot(file, "new content")).not.toThrow();
		expect(readFileSync(file, "utf-8")).toBe("new content");
	});

	it("accepts array content, joining with newlines -- convenient for RenderedTerminal.plainLines()", () => {
		dir = mkdtempSync(join(tmpdir(), "pi-tui-harness-snapshot-"));
		const file = join(dir, "lines.snap");
		expectSnapshot(file, ["one", "two", "three"]);
		expect(readFileSync(file, "utf-8")).toBe("one\ntwo\nthree");
	});
});
