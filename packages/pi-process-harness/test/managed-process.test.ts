import { describe, expect, it } from "bun:test";
import { spawnManagedProcess } from "../src/managed-process.ts";

describe("spawnManagedProcess", () => {
	it("captures stdout via onStdout", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.stdout.write('hello\\n')"] });
		const chunks: string[] = [];
		proc.onStdout((chunk) => chunks.push(chunk.toString("utf-8")));
		const code = await proc.waitForExit();
		expect(code).toBe(0);
		expect(chunks.join("")).toContain("hello");
	});

	it("captures stderr, bounded to the most recent MAX_STDERR_CHARS", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.stderr.write('x'.repeat(20000))"] });
		await proc.waitForExit();
		expect(proc.stderr.length).toBeLessThanOrEqual(8_000);
		expect(proc.stderr.length).toBeGreaterThan(0);
	});

	it("write() sends data to the child's stdin", async () => {
		const proc = spawnManagedProcess({
			command: "node",
			args: ["-e", "process.stdin.on('data', (d) => process.stdout.write(`echo:${d}`))"],
		});
		const chunks: string[] = [];
		proc.onStdout((chunk) => chunks.push(chunk.toString("utf-8")));
		proc.write("ping\n");
		await new Promise((resolve) => setTimeout(resolve, 200));
		proc.dispose();
		await proc.waitForExit();
		expect(chunks.join("")).toContain("echo:ping");
	});

	it("write() after the process has already exited is a silent no-op, not a throw", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.exit(0)"] });
		await proc.waitForExit();
		expect(() => proc.write("too late\n")).not.toThrow();
	});

	it("exitCode reflects the real exit code once the process has exited", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.exit(3)"] });
		await proc.waitForExit();
		expect(proc.exitCode).toBe(3);
	});

	it("dispose() on an already-exited process resolves immediately without signaling anything", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.exit(0)"] });
		await proc.waitForExit();
		await proc.dispose();
		expect(proc.exitCode).toBe(0);
	});

	it("dispose() on a running process sends SIGTERM and resolves once it actually exits -- a signal kill has a null exitCode by design, so hasExited/signalCode are what actually prove it died", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "setInterval(() => {}, 1000)"] });
		await new Promise((resolve) => setTimeout(resolve, 100)); // let it actually start
		await proc.dispose();
		expect(proc.hasExited).toBe(true);
		expect(proc.signalCode).toBe("SIGTERM");
		expect(proc.exitCode).toBeNull();
	});

	it("dispose() escalates to SIGKILL after the grace period for a process that ignores SIGTERM", async () => {
		const proc = spawnManagedProcess({
			command: "node",
			args: ["-e", "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000)"],
			gracefulShutdownTimeoutMs: 100,
		});
		await new Promise((resolve) => setTimeout(resolve, 100));
		await proc.dispose();
		expect(proc.hasExited).toBe(true);
		expect(proc.signalCode).toBe("SIGKILL");
	}, 5000);

	it("write() after a signal-killed exit is a silent no-op, not a throw -- exitCode alone (null) cannot distinguish this from still-running", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "setInterval(() => {}, 1000)"] });
		await new Promise((resolve) => setTimeout(resolve, 100));
		await proc.dispose();
		expect(proc.exitCode).toBeNull();
		expect(() => proc.write("too late\n")).not.toThrow();
	});

	it("hasExited/signalCode are both false/null while the process is genuinely still running", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "setInterval(() => {}, 1000)"] });
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(proc.hasExited).toBe(false);
		expect(proc.signalCode).toBeNull();
		expect(proc.exitCode).toBeNull();
		await proc.dispose();
	});

	it("pid is a real positive number while the process is alive", async () => {
		const proc = spawnManagedProcess({ command: "node", args: ["-e", "process.exit(0)"] });
		expect(proc.pid).toBeGreaterThan(0);
		await proc.waitForExit();
	});
});
