import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, "../src/mock-pi-cli.mjs");
const SAMPLE = join(__dirname, "fixtures/sample-extension.ts");
const BROKEN = join(__dirname, "fixtures/broken-extension.ts");
const THROWING = join(__dirname, "fixtures/throwing-extension.ts");

function run(args: string[]): Promise<{ code: number | null; stdout: string; stderr: string }> {
	return new Promise((resolvePromise) => {
		const proc = spawn("node", [CLI, ...args], { stdio: ["ignore", "pipe", "pipe"] });
		let stdout = "";
		let stderr = "";
		proc.stdout.on("data", (chunk) => { stdout += chunk; });
		proc.stderr.on("data", (chunk) => { stderr += chunk; });
		proc.on("close", (code) => resolvePromise({ code, stdout, stderr }));
	});
}

function lastEvent(stdout: string): unknown {
	const lines = stdout.trim().split("\n").filter(Boolean);
	return JSON.parse(lines.at(-1) ?? "{}");
}

describe("mock-pi-cli load-only mode (--tool omitted)", () => {
	it("reports load_ok and exits 0 for an extension that registers cleanly", async () => {
		const { code, stdout } = await run(["--extension", SAMPLE]);
		expect(code).toBe(0);
		expect(lastEvent(stdout)).toEqual({ type: "load_ok" });
	});

	it("reports load_error and exits 1 when the factory throws during registration", async () => {
		const { code, stdout } = await run(["--extension", THROWING]);
		expect(code).toBe(1);
		expect(lastEvent(stdout)).toMatchObject({ type: "load_error", error: expect.stringContaining("deliberately fails") });
	});

	it("reports load_error and exits 1 when the module has no default factory export", async () => {
		const { code, stdout } = await run(["--extension", BROKEN]);
		expect(code).toBe(1);
		expect(lastEvent(stdout)).toMatchObject({ type: "load_error", error: expect.stringContaining("did not export a default function") });
	});

	it("still requires --extension", async () => {
		const { code, stdout, stderr } = await run([]);
		expect(code).toBe(1);
		expect(stdout).toBe("");
		expect(stderr).toContain("--extension required");
	});
});

describe("mock-pi-cli tool-invocation mode (--tool given) is unaffected by the load-only addition", () => {
	it("still requires --tool to resolve to a real registered tool", async () => {
		const { code, stderr } = await run(["--extension", SAMPLE, "--tool", "nonexistent"]);
		expect(code).toBe(1);
		expect(stderr).toContain("tool not found: nonexistent");
	});

	it("still invokes a real tool end-to-end and emits its NDJSON lifecycle", async () => {
		const { code, stdout } = await run(["--extension", SAMPLE, "--tool", "sample_tool", "--params", JSON.stringify({ value: "hi" })]);
		expect(code).toBe(0);
		// sample-extension.ts deliberately leaks a plain console.log line (for the
		// in-process harness's own leak-detection tests) -- filter to real NDJSON.
		const events = stdout.trim().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
		expect(events[0]).toMatchObject({ type: "tool_execution_start", toolName: "sample_tool" });
		expect(events.at(-1)).toEqual({ type: "exit", code: 0 });
	});
});
