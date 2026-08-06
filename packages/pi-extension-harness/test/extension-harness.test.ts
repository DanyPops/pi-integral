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

	it("existingTools seeds getAllTools() with tools registered elsewhere, plus this factory's own", () => {
		let seen: Array<{ name: string }> = [];
		const h = createExtensionHarness(
			(pi) => {
				pi.registerTool({ name: "my_tool", description: "x", parameters: {}, execute: async () => ({ content: [] }) } as any);
				seen = pi.getAllTools();
			},
			{ existingTools: ["other_extensions_tool"] },
		);
		expect(h.tools.has("my_tool")).toBe(true);
		expect(seen.map((t) => t.name).sort()).toEqual(["my_tool", "other_extensions_tool"]);
	});

	it("existingTools also seeds getActiveTools()'s starting value by default", () => {
		const h = createExtensionHarness(() => {}, { existingTools: ["other_extensions_tool"] });
		expect(h.activeTools).toEqual(["other_extensions_tool"]);
	});

	it("initialActiveTools overrides existingTools' default seeding for getActiveTools()", () => {
		const h = createExtensionHarness(() => {}, { existingTools: ["exists_but_inactive"], initialActiveTools: [] });
		expect(h.activeTools).toEqual([]);
	});

	it("activeToolsHistory records every setActiveTools() call, not just the final value", () => {
		const h = createExtensionHarness((pi) => {
			pi.setActiveTools(["a"]);
			pi.setActiveTools(["a", "b"]);
		});
		expect(h.activeToolsHistory).toEqual([["a"], ["a", "b"]]);
		expect(h.activeTools).toEqual(["a", "b"]);
	});

	it("appendedEntries records every pi.appendEntry() call, in order", async () => {
		const h = createExtensionHarness((pi) => {
			pi.on("session_start", () => {
				pi.appendEntry("widget", { value: 1 });
			});
		});
		await h.boot();
		expect(h.appendedEntries).toEqual([{ customType: "widget", data: { value: 1 } }]);
		await h.shutdown();
		expect(h.appendedEntries).toHaveLength(0);
	});

	it("confirm option answers ctx.ui.confirm() with a fixed boolean instead of the hardcoded default false", async () => {
		const h = createExtensionHarness(() => {}, { confirm: true });
		expect(await h.ctx.ui.confirm("Confirm", "proceed?")).toBe(true);
	});

	it("confirm option accepts a function, invoked fresh on every call", async () => {
		let calls = 0;
		const h = createExtensionHarness(() => {}, {
			confirm: () => {
				calls++;
				return calls === 1;
			},
		});
		expect(await h.ctx.ui.confirm("Confirm", "first")).toBe(true);
		expect(await h.ctx.ui.confirm("Confirm", "second")).toBe(false);
	});

	it("confirm option's function form receives the real title/message ctx.ui.confirm() was called with", async () => {
		const seen: Array<[string, string]> = [];
		const h = createExtensionHarness(() => {}, {
			confirm: (title, message) => {
				seen.push([title, message]);
				return title.includes("recovery");
			},
		});
		expect(await h.ctx.ui.confirm("Disable routing enforcement?", "details")).toBe(false);
		expect(await h.ctx.ui.confirm("Enable Codex recovery?", "details")).toBe(true);
		expect(seen).toEqual([
			["Disable routing enforcement?", "details"],
			["Enable Codex recovery?", "details"],
		]);
	});

	it("input option answers ctx.ui.input() with a fixed string instead of the hardcoded default undefined", async () => {
		const h = createExtensionHarness(() => {}, { input: "300,000" });
		expect(await h.ctx.ui.input("Token budget", "e.g. 300,000")).toBe("300,000");
	});

	it("input option accepts a function for queuing a sequence of scenario-specific answers", async () => {
		const queue = ["300,000", "off"];
		const h = createExtensionHarness(() => {}, { input: () => queue.shift() });
		expect(await h.ctx.ui.input("Daily budget")).toBe("300,000");
		expect(await h.ctx.ui.input("Hourly budget")).toBe("off");
		expect(await h.ctx.ui.input("Weekly budget")).toBeUndefined();
	});

	it("custom option hands the real factory to the caller's own implementation instead of the hardcoded no-op default", async () => {
		const h = createExtensionHarness(() => {}, {
			custom: (factory) => {
				// Mirrors a real panel: build a minimal Component via the factory, drive it, and
				// resolve custom() with whatever the scenario needs. Loosely typed (any), same as every
				// real consumer's own test fixture -- a fully Component-typed fake buys nothing here.
				const component = factory({}, { fg: (_c: string, text: string) => text, bold: (text: string) => text }, {}, () => undefined);
				return component.render(80).join("\n");
			},
		});
		const rendered = await h.ctx.ui.custom<string>(((
			_tui: unknown,
			_theme: unknown,
			_keybindings: unknown,
			_done: (v: unknown) => void,
		) => ({
			render: (width: number) => [`panel width=${width}`],
		})) as any);
		expect(rendered).toBe("panel width=80");
	});

	it("custom option defaults to undefined, matching the prior hardcoded no-selection behaviour", async () => {
		const h = createExtensionHarness(() => {});
		expect(await h.ctx.ui.custom((() => "should never be reached") as any)).toBeUndefined();
	});

	it("ctx satisfies the wider ExtensionCommandContext -- command-only methods exist with safe never-cancelled defaults", async () => {
		const h = createExtensionHarness(() => {});
		expect(h.ctx.getSystemPromptOptions()).toEqual({} as any);
		await expect(h.ctx.waitForIdle()).resolves.toBeUndefined();
		expect(await h.ctx.newSession()).toEqual({ cancelled: false });
		expect(await h.ctx.fork("entry-1")).toEqual({ cancelled: false });
		expect(await h.ctx.navigateTree("entry-1")).toEqual({ cancelled: false });
		expect(await h.ctx.switchSession("/tmp/session.jsonl")).toEqual({ cancelled: false });
		await expect(h.ctx.reload()).resolves.toBeUndefined();
	});

	it("invalidateCtx() makes every ctx property/method access throw, matching ExtensionRunner.assertActive() after a real session replacement/reload", () => {
		const h = createExtensionHarness(() => {});
		expect(h.ctx.cwd).toBeDefined();

		h.invalidateCtx();

		expect(() => h.ctx.cwd).toThrow(/This extension ctx is stale after session replacement or reload/);
		expect(() => h.ctx.ui).toThrow(/This extension ctx is stale/);
		expect(() => h.ctx.isIdle).toThrow(/This extension ctx is stale/);
	});

	it("invalidateCtx() accepts a custom message instead of the default stale-ctx wording", () => {
		const h = createExtensionHarness(() => {});
		h.invalidateCtx("stale after /reload");
		expect(() => h.ctx.mode).toThrow("stale after /reload");
	});

	it("ctx.newSession()/.fork()/.switchSession()/.reload() stay permissive no-ops -- invalidateCtx() is opt-in, not wired to them automatically", async () => {
		const h = createExtensionHarness(() => {});
		await h.ctx.newSession();
		await h.ctx.reload();
		expect(h.ctx.cwd).toBeDefined();
	});

	it("invokeCommand() passes the same ExtensionCommandContext-shaped ctx a command handler is really typed to receive", async () => {
		let sawWaitForIdle = false;
		const h = createExtensionHarness((pi) => {
			pi.registerCommand("probe", {
				description: "probes ctx",
				handler: async (_args, ctx) => {
					await ctx.waitForIdle();
					sawWaitForIdle = true;
				},
			});
		});
		await h.invokeCommand("probe");
		expect(sawWaitForIdle).toBe(true);
	});

	it("mode option overrides ctx.mode's hardcoded 'print' default", () => {
		const h = createExtensionHarness(() => {}, { mode: "tui" });
		expect(h.ctx.mode).toBe("tui");
	});

	it("exposes the raw pi: ExtensionAPI stub for calling a helper directly, standalone, outside any factory", () => {
		const h = createExtensionHarness(() => {});
		const appended: Array<{ customType: string; data: unknown }> = [];
		h.api.appendEntry("probe", { x: 1 });
		appended.push(...h.appendedEntries);
		expect(appended).toEqual([{ customType: "probe", data: { x: 1 } }]);
	});

	it("exposes a real events: EventBus on pi -- cross-extension shared-bus code needs no second hand-rolled fake", () => {
		const received: unknown[] = [];
		const h = createExtensionHarness((pi) => {
			pi.events.on("some.channel.v1", (payload) => {
				received.push(payload);
			});
		});
		h.api.events.emit("some.channel.v1", { hello: "world" });
		expect(received).toEqual([{ hello: "world" }]);
	});

	it("events.on() returns an unsubscribe function, matching Pi's own real EventBus contract", () => {
		const received: unknown[] = [];
		const h = createExtensionHarness(() => {});
		const unsubscribe = h.api.events.on("some.channel.v1", (payload) => {
			received.push(payload);
		});
		h.api.events.emit("some.channel.v1", 1);
		unsubscribe();
		h.api.events.emit("some.channel.v1", 2);
		expect(received).toEqual([1]);
	});
});
