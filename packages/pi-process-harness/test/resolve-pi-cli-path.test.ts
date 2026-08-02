import { describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";
import { resolvePiCliPath } from "../src/resolve-pi-cli-path.js";

describe("resolvePiCliPath", () => {
	it("resolves to a real, existing dist/cli.js next to the installed @earendil-works/pi-coding-agent's own dist/index.js", () => {
		const path = resolvePiCliPath();
		expect(path.endsWith("cli.js")).toBe(true);
		expect(existsSync(path)).toBe(true);
	});
});
