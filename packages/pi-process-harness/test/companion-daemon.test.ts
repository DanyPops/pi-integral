import { afterEach, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type CompanionDaemon, CompanionDaemonReadyTimeoutError, spawnCompanionDaemon } from "../src/companion-daemon.ts";

const MARKER_DAEMON = fileURLToPath(new URL("./fixtures/marker-daemon.mjs", import.meta.url));

let tempDir: string | undefined;
let daemon: CompanionDaemon | undefined;

afterEach(async () => {
	await daemon?.dispose();
	daemon = undefined;
	if (tempDir) rmSync(tempDir, { recursive: true, force: true });
	tempDir = undefined;
});

describe("spawnCompanionDaemon", () => {
	it("waits for a real process to become ready, then disposes it cleanly", async () => {
		tempDir = mkdtempSync(join(tmpdir(), "pi-process-harness-companion-"));
		const markerPath = join(tempDir, "marker");

		daemon = await spawnCompanionDaemon({
			command: "node",
			args: [MARKER_DAEMON, markerPath, "200"],
			isReady: () => existsSync(markerPath),
			readyTimeoutMs: 5_000,
			pollIntervalMs: 20,
		});

		expect(daemon.pid).toBeGreaterThan(0);
		expect(daemon.exitCode).toBeNull();

		await daemon.dispose();
		expect(daemon.exitCode).not.toBeNull();
	});

	it("rejects with CompanionDaemonReadyTimeoutError when the process never becomes ready, and kills it", async () => {
		await expect(
			spawnCompanionDaemon({
				command: "node",
				args: [MARKER_DAEMON, "/nonexistent/marker/path/that/is/never/written", "60000"],
				isReady: () => false,
				readyTimeoutMs: 200,
				pollIntervalMs: 20,
			}),
		).rejects.toBeInstanceOf(CompanionDaemonReadyTimeoutError);
	});
});
