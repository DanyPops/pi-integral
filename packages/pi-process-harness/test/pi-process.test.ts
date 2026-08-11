import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { resolveFauxProviderExtensionPath } from "../src/faux-provider-path.ts";
import { encodeFauxScript, SCRIPT_ENV_VAR } from "../src/faux-script.ts";
import { spawnRealPiProcess, waitForRpcEvent } from "../src/pi-process.ts";

const ECHO_EXTENSION = fileURLToPath(new URL("./fixtures/echo-tool-extension.ts", import.meta.url));
const PAYLOAD_OBSERVER_EXTENSION = fileURLToPath(new URL("./fixtures/provider-payload-observer-extension.ts", import.meta.url));

describe("spawnRealPiProcess + faux provider", () => {
	it("drives a real AgentSession to genuinely decide to call a real registered tool, no live LLM", async () => {
		const proc = spawnRealPiProcess({
			extensions: [resolveFauxProviderExtensionPath(), ECHO_EXTENSION, PAYLOAD_OBSERVER_EXTENSION],
			extraArgs: ["--provider", "faux", "--model", "faux-1"],
			env: {
				[SCRIPT_ENV_VAR]: encodeFauxScript([{ type: "toolCall", name: "echo_tool", arguments: { message: "hello from the faux model" } }]),
			},
		});

		const events: AgentSessionEvent[] = [];
		proc.onEvent((event) => events.push(event));
		proc.sendPrompt("go");

		const end = await waitForRpcEvent(
			events,
			(event): event is Extract<AgentSessionEvent, { type: "tool_execution_end" }> => event.type === "tool_execution_end",
			{
				timeoutMs: 15_000,
			},
		);

		expect(
			(events as unknown as Array<{ type: string; statusKey?: string }>).some(
				(event) => event.type === "extension_ui_request" && event.statusKey === "provider-payload-observed",
			),
		).toBe(true);
		expect(end.type).toBe("tool_execution_end");
		if (end.type === "tool_execution_end") {
			expect(end.toolName).toBe("echo_tool");
			expect(end.isError).toBe(false);
			expect(JSON.stringify(end.result)).toContain("hello from the faux model");
		}

		await proc.dispose();
	}, 20_000);

	it("send() issues an arbitrary RpcCommand verbatim, not just sendPrompt/abort's own fixed shapes", async () => {
		// No provider/model/extensions needed at all: get_entries answers from session state alone,
		// never touching a model -- isolatedHome's default fresh temp home keeps this a genuinely
		// empty session, distinct from the real operator's own profile.
		const proc = spawnRealPiProcess();
		const events: AgentSessionEvent[] = [];
		proc.onEvent((event) => events.push(event));

		proc.send({ type: "get_entries" });

		const response = await waitForRpcEvent(
			events,
			(event): event is Extract<AgentSessionEvent, { type: "response" }> =>
				(event as unknown as { type: string; command?: string }).type === "response" &&
				(event as unknown as { command?: string }).command === "get_entries",
			{ timeoutMs: 10_000 },
		);

		expect((response as unknown as { success: boolean }).success).toBe(true);
		// Not asserting exact entry content: a fresh isolated session still records its own default
		// model/thinking-level setup entries -- what this test proves is that send() reaches the real
		// process and a real, well-formed response comes back, not the shape of a brand-new session.
		expect(Array.isArray((response as unknown as { data: { entries: unknown[] } }).data.entries)).toBe(true);

		await proc.dispose();
	}, 15_000);
});
