import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { resolveFauxProviderExtensionPath } from "../src/faux-provider-path.ts";
import { encodeFauxScript, SCRIPT_ENV_VAR } from "../src/faux-script.ts";
import { spawnRealPiProcess, waitForRpcEvent } from "../src/pi-process.ts";

const ECHO_EXTENSION = fileURLToPath(new URL("./fixtures/echo-tool-extension.ts", import.meta.url));

describe("spawnRealPiProcess + faux provider", () => {
	it("drives a real AgentSession to genuinely decide to call a real registered tool, no live LLM", async () => {
		const proc = spawnRealPiProcess({
			extensions: [resolveFauxProviderExtensionPath(), ECHO_EXTENSION],
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

		expect(end.type).toBe("tool_execution_end");
		if (end.type === "tool_execution_end") {
			expect(end.toolName).toBe("echo_tool");
			expect(end.isError).toBe(false);
			expect(JSON.stringify(end.result)).toContain("hello from the faux model");
		}

		await proc.dispose();
	}, 20_000);
});
