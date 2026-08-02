/**
 * Confirmed live before this fix existed: a spawned `pi` process without
 * environment isolation silently ignored `--provider`/`--model` overrides,
 * loaded the real operator's own ~/.pi/agent extensions and settings, and
 * made a real paid LLM call instead of using a scripted faux provider. This
 * file exists specifically to keep that regression from coming back.
 */
import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { spawnRealPiProcess } from "../src/pi-process.ts";

describe("spawnRealPiProcess environment isolation", () => {
	it("defaults to a fresh temp home directory, distinct from the real operator's home", () => {
		const proc = spawnRealPiProcess({ extraArgs: ["--help"] });
		expect(proc.homeDir).toBeDefined();
		expect(proc.homeDir).not.toBe(homedir());
		expect(existsSync(proc.homeDir!)).toBe(true);
		proc.dispose();
	});

	it("removes the owned temp home directory on dispose()", async () => {
		const proc = spawnRealPiProcess({ extraArgs: ["--help"] });
		const homeDir = proc.homeDir!;
		await proc.waitForExit();
		proc.dispose();
		await new Promise((resolve) => setTimeout(resolve, 100));
		expect(existsSync(homeDir)).toBe(false);
	});

	it("does not remove a caller-supplied isolatedHome directory on dispose()", async () => {
		const dir = mkdtempSync(join(tmpdir(), "pi-process-harness-owned-test-"));
		const proc = spawnRealPiProcess({ extraArgs: ["--help"], isolatedHome: dir });
		expect(proc.homeDir).toBe(dir);
		await proc.waitForExit();
		proc.dispose();
		expect(existsSync(dir)).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	it("has no homeDir when isolation is explicitly disabled", () => {
		const proc = spawnRealPiProcess({ extraArgs: ["--help"], isolatedHome: false });
		expect(proc.homeDir).toBeUndefined();
		proc.dispose();
	});
});
