import { describe, expect, it } from "bun:test";
import { createExtensionHarness } from "../src/extension-harness.ts";
import sampleExtension from "./fixtures/sample-extension.ts";

describe("createExtensionHarness", () => {
	it("registers a tool at factory-call time, before boot()", () => {
		const h = createExtensionHarness(sampleExtension);
		expect(h.tools.has("sample_tool")).toBe(true);
		expect(h.tools.get("sample_tool")?.definition.description).toContain("Echoes");
	});

	it("registers a command with its handler", () => {
		const h = createExtensionHarness(sampleExtension);
		expect(h.commands).toEqual(["sample"]);
	});

	it("reflects setActiveTools() called during factory registration", () => {
		const h = createExtensionHarness(sampleExtension);
		expect(h.activeTools).toEqual(["sample_tool"]);
	});

	it("boot() fires session_start, recording a notification", async () => {
		const h = createExtensionHarness(sampleExtension);
		expect(h.notifications).toHaveLength(0);
		await h.boot();
		expect(h.notifications).toEqual([{ message: "sample extension started", type: "info" }]);
		await h.shutdown();
	});

	it("shutdown() fires session_shutdown and clears observable state", async () => {
		const h = createExtensionHarness(sampleExtension);
		await h.boot();
		await h.shutdown();
		expect(h.notifications).toHaveLength(0);
		expect(h.tools.size).toBe(0);
		expect(h.commands).toHaveLength(0);
		expect(h.activeTools).toHaveLength(0);
	});

	it("invokeTool() calls the real tool execute(), bypassing the LLM entirely", async () => {
		const h = createExtensionHarness(sampleExtension);
		await h.boot();
		const result = (await h.invokeTool("sample_tool", { value: "hello" })) as { content: { text: string }[] };
		const parsed = JSON.parse(result.content[0]!.text);
		expect(parsed.echoed).toBe("hello");
		await h.shutdown();
	});

	it("invokeTool() throws for an unregistered tool name", async () => {
		const h = createExtensionHarness(sampleExtension);
		await h.boot();
		await expect(h.invokeTool("nonexistent", {})).rejects.toThrow(/not registered/);
		await h.shutdown();
	});

	it("invokeCommand() calls the real command handler, recording its notification", async () => {
		const h = createExtensionHarness(sampleExtension);
		await h.boot();
		await h.invokeCommand("sample", "some args");
		expect(h.notifications.at(-1)).toEqual({ message: "sample command ran with args: some args", type: "info" });
		await h.shutdown();
	});

	it("invokeCommand() throws for an unregistered command name", async () => {
		const h = createExtensionHarness(sampleExtension);
		await expect(h.invokeCommand("nonexistent")).rejects.toThrow(/not registered/);
	});

	it("applies env overrides for the duration of boot()..shutdown(), restoring the prior value after", async () => {
		const original = process.env.SAMPLE_EXTENSION_ENV;
		const h = createExtensionHarness(sampleExtension, { env: { SAMPLE_EXTENSION_ENV: "test-value" } });
		await h.boot();
		expect(process.env.SAMPLE_EXTENSION_ENV).toBe("test-value");
		const result = (await h.invokeTool("sample_tool", { value: "x" })) as { content: { text: string }[] };
		expect(JSON.parse(result.content[0]!.text).env).toBe("test-value");
		await h.shutdown();
		expect(process.env.SAMPLE_EXTENSION_ENV).toBe(original);
	});

	it("detects a direct console.log leak instead of silently forwarding it", async () => {
		const h = createExtensionHarness(sampleExtension);
		await h.boot();
		expect(h.leaks).toHaveLength(0);
		await h.invokeTool("sample_tool", { value: "x" });
		expect(h.leaks).toHaveLength(1);
		expect(h.leaks[0]).toEqual({ stream: "stdout", content: "[console.log] leaking to stdout" });
		await h.shutdown();
	});

	it("emit() dispatches to every handler registered for that event and returns the last non-undefined result", async () => {
		let calls = 0;
		// pi: any -- exercising an event name not part of the real ExtensionEvent
		// union (emit() itself accepts any string, mirroring how a real Pi
		// extension may listen to a custom message-driven event dispatched by
		// another extension).
		const h = createExtensionHarness((pi: any) => {
			pi.on("custom_event", () => {
				calls++;
				return undefined;
			});
			pi.on("custom_event", () => {
				calls++;
				return "second";
			});
		});
		const result = await h.emit("custom_event");
		expect(calls).toBe(2);
		expect(result).toBe("second");
	});

	it("supports an async factory, awaiting it in boot() before session_start fires", async () => {
		const order: string[] = [];
		const h = createExtensionHarness(async (pi) => {
			await new Promise((resolve) => setTimeout(resolve, 1));
			order.push("factory-resolved");
			pi.on("session_start", () => {
				order.push("session_start");
			});
		});
		await h.boot();
		expect(order).toEqual(["factory-resolved", "session_start"]);
		await h.shutdown();
	});
});
