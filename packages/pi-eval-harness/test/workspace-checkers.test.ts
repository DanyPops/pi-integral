import { describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { any, fileContains, fileExists, lintPasses } from "../src/workspace-checkers.ts";

function tempWorkspace(): string {
	return mkdtempSync(join(tmpdir(), "pi-eval-harness-workspace-checker-"));
}

describe("fileExists", () => {
	it("scores 0.5 when the file exists -- existence alone is partial credit", async () => {
		const workspace = tempWorkspace();
		writeFileSync(join(workspace, "output.ts"), "export const x = 1;\n");
		try {
			expect(await fileExists("output.ts").check({ executions: [], workspace })).toEqual({
				pass: true,
				score: 0.5,
				errors: [],
			});
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("scores 0 with a real error when the file is missing", async () => {
		const workspace = tempWorkspace();
		try {
			const result = await fileExists("missing.ts").check({ executions: [], workspace });
			expect(result.pass).toBe(false);
			expect(result.score).toBe(0);
			expect(result.errors).toEqual(["File not found: missing.ts"]);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("fails closed with a clear error when no workspace is in context", async () => {
		const result = await fileExists("output.ts").check({ executions: [] });
		expect(result).toEqual({ pass: false, score: 0, errors: ["fileExists: no workspace in CheckerContext"] });
	});
});

describe("fileContains", () => {
	it("scores 1.0 when every required string is present", async () => {
		const workspace = tempWorkspace();
		writeFileSync(join(workspace, "output.ts"), "export async function fetchData() {}\n");
		try {
			expect(await fileContains("output.ts", "async", "fetchData").check({ executions: [], workspace })).toEqual({
				pass: true,
				score: 1,
				errors: [],
			});
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("scores 0.5 with the missing strings named when only some are present", async () => {
		const workspace = tempWorkspace();
		writeFileSync(join(workspace, "output.ts"), "export function fetchData() {}\n");
		try {
			const result = await fileContains("output.ts", "async", "fetchData").check({ executions: [], workspace });
			expect(result.pass).toBe(false);
			expect(result.score).toBe(0.5);
			expect(result.errors).toEqual(["'async' not found in output.ts"]);
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("scores 0 when the file itself is missing", async () => {
		const workspace = tempWorkspace();
		try {
			const result = await fileContains("missing.ts", "anything").check({ executions: [], workspace });
			expect(result).toEqual({ pass: false, score: 0, errors: ["File not found: missing.ts"] });
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});
});

describe("lintPasses", () => {
	it("passes when the real command exits 0", async () => {
		const workspace = tempWorkspace();
		try {
			expect(await lintPasses("node", ["-e", "process.exit(0)"]).check({ executions: [], workspace })).toEqual({
				pass: true,
				score: 1,
				errors: [],
			});
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("fails with the real exit code and stderr when the command exits non-zero", async () => {
		const workspace = tempWorkspace();
		try {
			const result = await lintPasses("node", ["-e", "console.error('boom'); process.exit(1)"]).check({
				executions: [],
				workspace,
			});
			expect(result.pass).toBe(false);
			expect(result.score).toBe(0);
			expect(result.errors[0]).toContain("exited 1");
			expect(result.errors[0]).toContain("boom");
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("fails closed with a clear error when no workspace is in context", async () => {
		const result = await lintPasses("node", ["-e", "process.exit(0)"]).check({ executions: [] });
		expect(result).toEqual({ pass: false, score: 0, errors: ["lintPasses: no workspace in CheckerContext"] });
	});
});

describe("any", () => {
	it("returns the maximum score across composed checkers (lenient OR)", async () => {
		const workspace = tempWorkspace();
		writeFileSync(join(workspace, "output.ts"), "export const x = 1;\n");
		try {
			const combined = any(fileExists("missing.ts"), fileExists("output.ts"));
			expect(await combined.check({ executions: [], workspace })).toEqual({ pass: true, score: 0.5, errors: [] });
		} finally {
			rmSync(workspace, { recursive: true, force: true });
		}
	});

	it("passes vacuously with no checkers", async () => {
		expect(await any().check({ executions: [] })).toEqual({ pass: true, score: 1, errors: [] });
	});
});
