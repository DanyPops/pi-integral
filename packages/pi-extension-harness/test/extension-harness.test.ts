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

	// Restores the prior value after shutdown().
	it("applies env overrides for the duration of boot()..shutdown()", async () => {
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

	it("emit() dispatches to every handler for an event, returning the last non-undefined result", async () => {
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

	it("existingTools seeds getAllTools() with tools registered elsewhere", () => {
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

	it("confirm option answers ctx.ui.confirm() with a fixed boolean", async () => {
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

	it("confirm option's function form receives the real title/message it was called with", async () => {
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

	it("input option answers ctx.ui.input() with a fixed string", async () => {
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

	it("custom option hands the real factory to the caller's own implementation", async () => {
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

	// Command-only methods exist with safe never-cancelled defaults.
	it("ctx satisfies the wider ExtensionCommandContext", async () => {
		const h = createExtensionHarness(() => {});
		expect(h.ctx.getSystemPromptOptions()).toEqual({} as any);
		await expect(h.ctx.waitForIdle()).resolves.toBeUndefined();
		expect(await h.ctx.newSession()).toEqual({ cancelled: false });
		expect(await h.ctx.fork("entry-1")).toEqual({ cancelled: false });
		expect(await h.ctx.navigateTree("entry-1")).toEqual({ cancelled: false });
		expect(await h.ctx.switchSession("/tmp/session.jsonl")).toEqual({ cancelled: false });
		await expect(h.ctx.reload()).resolves.toBeUndefined();
	});

	// Matches ExtensionRunner.assertActive() after a real session replacement/reload.
	it("invalidateCtx() makes every ctx property/method access throw", () => {
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

	// invalidateCtx() is opt-in, never wired to these automatically.
	it("ctx.newSession()/.fork()/.switchSession()/.reload() stay permissive no-ops", async () => {
		const h = createExtensionHarness(() => {});
		await h.ctx.newSession();
		await h.ctx.reload();
		expect(h.ctx.cwd).toBeDefined();
	});

	it("invokeCommand() passes the same ctx shape a command handler is really typed to receive", async () => {
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

	it("exposes the raw pi: ExtensionAPI stub for calling a helper directly, outside any factory", () => {
		const h = createExtensionHarness(() => {});
		const appended: Array<{ customType: string; data: unknown }> = [];
		h.api.appendEntry("probe", { x: 1 });
		appended.push(...h.appendedEntries);
		expect(appended).toEqual([{ customType: "probe", data: { x: 1 } }]);
	});

	// Cross-extension shared-bus code needs no second hand-rolled fake.
	it("exposes a real events: EventBus on pi", () => {
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

	it("attributes factory and handler durations by lifecycle event and registration order", async () => {
		let clock = 0;
		const h = createExtensionHarness(
			(pi) => {
				pi.on("session_start", async () => {});
				pi.on("session_start", async () => {});
				pi.on("resources_discover", async () => ({}));
			},
			{ now: () => (clock += 10) },
		);

		await h.boot();
		await h.emit("resources_discover", { reason: "startup" });

		expect(h.lifecycleTimings).toEqual([
			{ phase: "factory", invocation: 0, durationMs: 10, outcome: "success" },
			{ phase: "handler", event: "session_start", handlerIndex: 0, invocation: 0, durationMs: 10, outcome: "success" },
			{ phase: "handler", event: "session_start", handlerIndex: 1, invocation: 1, durationMs: 10, outcome: "success" },
			{ phase: "handler", event: "resources_discover", handlerIndex: 0, invocation: 2, durationMs: 10, outcome: "success" },
		]);
	});

	it("records a rejected handler before propagating its error", async () => {
		let clock = 0;
		const h = createExtensionHarness(
			(pi) => {
				pi.on("custom_event" as never, async () => {
					throw new Error("boom");
				});
			},
			{ now: () => (clock += 5) },
		);

		await h.boot();
		await expect(h.emit("custom_event")).rejects.toThrow("boom");
		expect(h.lifecycleTimings.at(-1)).toEqual({
			phase: "handler",
			event: "custom_event",
			handlerIndex: 0,
			invocation: 0,
			durationMs: 5,
			outcome: "error",
		});
	});

	it("preserves synchronous factory errors at harness construction", () => {
		const stdoutWrite = process.stdout.write;
		const consoleError = console.error;

		expect(() =>
			createExtensionHarness(() => {
				throw new Error("sync factory failure");
			}),
		).toThrow("sync factory failure");
		expect(process.stdout.write).toBe(stdoutWrite);
		expect(console.error).toBe(consoleError);
	});

	it("restores process-global boot state after an asynchronous factory error", async () => {
		const originalConsoleError = console.error;
		const envKey = "PI_EXTENSION_HARNESS_BOOT_FAILURE_TEST";
		const previousEnv = process.env[envKey];
		let consoleCalls = 0;
		console.error = () => void consoleCalls++;
		try {
			const h = createExtensionHarness(
				async () => {
					await Promise.resolve();
					throw new Error("async factory failure");
				},
				{ env: { [envKey]: "temporary" } },
			);

			await expect(h.boot()).rejects.toThrow("async factory failure");
			console.error("probe restored console");
			expect(consoleCalls).toBe(1);
			expect(process.env[envKey]).toBe(previousEnv);
		} finally {
			console.error = originalConsoleError;
			if (previousEnv === undefined) delete process.env[envKey];
			else process.env[envKey] = previousEnv;
		}
	});
});

describe("reload()", () => {
	it("re-runs the factory between session_shutdown and session_start", async () => {
		const lifecycleEvents: string[] = [];
		let factoryRunCount = 0;
		const h = createExtensionHarness((pi) => {
			factoryRunCount += 1;
			pi.on("session_shutdown", (event) => {
				lifecycleEvents.push(`shutdown:${(event as { reason?: string }).reason}`);
			});
			pi.on("session_start", (event) => {
				lifecycleEvents.push(`start:${(event as { reason?: string }).reason}`);
			});
		});
		await h.boot();
		expect(factoryRunCount).toBe(1);
		expect(lifecycleEvents).toEqual(["start:startup"]);

		await h.reload();
		expect(factoryRunCount).toBe(2);
		expect(lifecycleEvents).toEqual(["start:startup", "shutdown:reload", "start:reload"]);
	});

	// Matches a brand-new ExtensionRunner's empty registry -- a stale tool/command surviving
	// reload would falsely look re-registered without the factory ever running again.
	it("clears tools and commands before re-invoking the factory", async () => {
		let registrationPass = 0;
		const h = createExtensionHarness((pi) => {
			registrationPass += 1;
			pi.registerTool({
				name: "probe_tool",
				label: "Probe",
				description: `pass ${registrationPass}`,
				parameters: {} as never,
				async execute() {
					return { content: [], details: undefined };
				},
			});
			pi.registerCommand("probe_command", { description: "probes", handler: async () => {} });
		});
		await h.boot();
		expect(h.tools.get("probe_tool")?.definition.description).toBe("pass 1");
		expect(h.commands).toEqual(["probe_command"]);

		await h.reload();
		// Re-registered fresh (pass 2's description), not left over from pass 1, and not duplicated.
		expect(h.tools.size).toBe(1);
		expect(h.tools.get("probe_tool")?.definition.description).toBe("pass 2");
		expect(h.commands).toEqual(["probe_command"]);
	});

	it("leaves existingTools untouched across reload", async () => {
		const h = createExtensionHarness(
			(pi) => {
				pi.registerTool({
					name: "own_tool",
					label: "Own",
					description: "d",
					parameters: {} as never,
					async execute() {
						return { content: [], details: undefined };
					},
				});
			},
			{ existingTools: ["other_extensions_tool"] },
		);
		await h.boot();
		expect(
			h.api
				.getAllTools()
				.map((t) => t.name)
				.sort(),
		).toEqual(["other_extensions_tool", "own_tool"]);

		await h.reload();
		expect(
			h.api
				.getAllTools()
				.map((t) => t.name)
				.sort(),
		).toEqual(["other_extensions_tool", "own_tool"]);
	});

	it("preserves cumulative observations like notifications across reload", async () => {
		const h = createExtensionHarness((pi) => {
			pi.on("session_start", (_event, ctx) => {
				ctx.ui.notify("hello");
			});
		});
		await h.boot();
		expect(h.notifications).toHaveLength(1);

		await h.reload();
		expect(h.notifications).toHaveLength(2);
	});
});

describe("pi.sendMessage()", () => {
	it("records a custom message, distinct from sendUserMessage's own userMessages", () => {
		const h = createExtensionHarness((pi) => {
			pi.registerCommand("probe", {
				handler: async () => {
					pi.sendMessage({ customType: "my-extension", content: "hello", display: true }, { deliverAs: "followUp" });
				},
			});
		});

		expect(h.sentMessages).toEqual([]);
		void h.invokeCommand("probe");
		expect(h.sentMessages).toEqual([
			{ message: { customType: "my-extension", content: "hello", display: true }, options: { deliverAs: "followUp" } },
		]);
		expect(h.userMessages).toEqual([]); // a distinct channel from sendUserMessage -- never cross-recorded
	});
});
