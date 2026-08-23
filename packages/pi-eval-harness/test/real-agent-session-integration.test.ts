/**
 * Proves the ported matching/extraction logic against a genuine (scripted, no live LLM)
 * `@danypops/pi-process-harness` run's own real `AgentSessionEvent` stream -- not only a
 * hand-authored fixture. This is the seam the port from Alef's OTel `SpanRecord[]` had to get
 * right: a real registered tool's real args/result flowing through the real RPC wire format.
 */

import { describe, expect, it } from "bun:test";
import { fileURLToPath } from "node:url";
import {
	encodeFauxScript,
	resolveFauxProviderExtensionPath,
	SCRIPT_ENV_VAR,
	spawnRealPiProcess,
	waitForRpcEvent,
} from "@danypops/pi-process-harness";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { expectsAll } from "../src/checker.ts";
import { extractToolExecutions } from "../src/tool-executions.ts";

const SEARCH_LIKE_EXTENSION = fileURLToPath(new URL("./fixtures/search-like-tool-extension.ts", import.meta.url));

describe("pi-eval-harness against a real scripted pi-process-harness run", () => {
	it("extracts and matches a real tool call from a genuine AgentSessionEvent stream", async () => {
		const proc = spawnRealPiProcess({
			extensions: [resolveFauxProviderExtensionPath(), SEARCH_LIKE_EXTENSION],
			extraArgs: ["--provider", "faux", "--model", "faux-1"],
			env: {
				[SCRIPT_ENV_VAR]: encodeFauxScript([{ type: "toolCall", name: "search_like_tool", arguments: { pattern: "foo" } }]),
			},
		});

		const events: AgentSessionEvent[] = [];
		proc.onEvent((event) => events.push(event));
		proc.sendPrompt("go");

		await waitForRpcEvent(
			events,
			(event): event is Extract<AgentSessionEvent, { type: "tool_execution_end" }> => event.type === "tool_execution_end",
			{ timeoutMs: 15_000 },
		);
		await proc.dispose();

		const executions = extractToolExecutions(events);
		expect(executions).toHaveLength(1);
		expect(executions[0]?.toolName).toBe("search_like_tool");
		expect(executions[0]?.isError).toBe(false);

		const checker = expectsAll([{ tool: "search_like_tool", target: { pattern: "foo" }, produces: "1 match" }]);
		const result = await checker.check({ executions });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	}, 20_000);
});
