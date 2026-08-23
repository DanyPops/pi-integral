import { describe, expect, it } from "bun:test";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { extractToolExecutions } from "../src/tool-executions.ts";

describe("extractToolExecutions", () => {
	it("pairs a start/end by toolCallId into one completed execution", () => {
		const events: AgentSessionEvent[] = [
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "search_code", args: { query: "foo" } },
			{ type: "tool_execution_end", toolCallId: "call-1", toolName: "search_code", result: "1 match", isError: false },
		];

		expect(extractToolExecutions(events)).toEqual([
			{
				toolCallId: "call-1",
				toolName: "search_code",
				args: { query: "foo" },
				result: "1 match",
				isError: false,
			},
		]);
	});

	it("preserves completion order across interleaved calls, not start order", () => {
		const events: AgentSessionEvent[] = [
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "search_code", args: {} },
			{ type: "tool_execution_start", toolCallId: "call-2", toolName: "find_symbols", args: {} },
			{ type: "tool_execution_end", toolCallId: "call-2", toolName: "find_symbols", result: [], isError: false },
			{ type: "tool_execution_end", toolCallId: "call-1", toolName: "search_code", result: [], isError: false },
		];

		expect(extractToolExecutions(events).map((execution) => execution.toolCallId)).toEqual(["call-2", "call-1"]);
	});

	it("drops a start with no matching end -- a still-running or aborted call is not real trace data", () => {
		const events: AgentSessionEvent[] = [{ type: "tool_execution_start", toolCallId: "call-1", toolName: "search_code", args: {} }];

		expect(extractToolExecutions(events)).toEqual([]);
	});

	it("drops an end with no matching start -- cannot reconstruct which tool or args produced it", () => {
		const events: AgentSessionEvent[] = [
			{ type: "tool_execution_end", toolCallId: "call-1", toolName: "search_code", result: [], isError: false },
		];

		expect(extractToolExecutions(events)).toEqual([]);
	});

	it("ignores non-tool-execution events entirely", () => {
		const events: AgentSessionEvent[] = [
			{ type: "agent_start" },
			{ type: "turn_start" },
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "search_code", args: {} },
			{ type: "tool_execution_end", toolCallId: "call-1", toolName: "search_code", result: [], isError: false },
		];

		expect(extractToolExecutions(events)).toHaveLength(1);
	});
});
