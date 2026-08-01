import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createExtensionHarness, loadExtensionViaJiti } from "../src/extension-harness.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE = join(__dirname, "fixtures/sample-extension.ts");
const BROKEN = join(__dirname, "fixtures/broken-extension.ts");

describe("loadExtensionViaJiti", () => {
	it("loads a real extension via the production (tryNative:false) jiti path and returns its factory", async () => {
		const factory = await loadExtensionViaJiti(SAMPLE);
		expect(typeof factory).toBe("function");
	});

	it("the loaded factory works with createExtensionHarness, exactly like a directly-imported one", async () => {
		const factory = await loadExtensionViaJiti(SAMPLE);
		const h = createExtensionHarness(factory);
		await h.boot();
		expect(h.tools.has("sample_tool")).toBe(true);
		await h.shutdown();
	});

	it("throws a clear, actionable error when the module has no default export function", async () => {
		await expect(loadExtensionViaJiti(BROKEN)).rejects.toThrow(/did not export a default function/);
	});

	it("accepts an empty nativeModules override for a lighter load", async () => {
		const factory = await loadExtensionViaJiti(SAMPLE, { nativeModules: [] });
		expect(typeof factory).toBe("function");
	});
});
