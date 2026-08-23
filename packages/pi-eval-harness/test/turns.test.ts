import { describe, expect, it } from "bun:test";
import type { AssistantMessage, ToolResultMessage } from "@earendil-works/pi-ai/compat";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { deriveTurns, summarizeRunUsage } from "../src/turns.ts";

function usage(overrides: Partial<AssistantMessage["usage"]> = {}) {
	return {
		input: 100,
		output: 20,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 120,
		cost: { input: 0.001, output: 0.0005, cacheRead: 0, cacheWrite: 0, total: 0.0015 },
		...overrides,
	};
}

function assistantMessage(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
	return {
		role: "assistant",
		content: [],
		api: "messages",
		provider: "anthropic",
		model: "claude-test",
		usage: usage(),
		stopReason: "toolUse",
		timestamp: 0,
		...overrides,
	};
}

function toolResult(toolName: string): ToolResultMessage {
	return {
		role: "toolResult",
		toolCallId: `call-${toolName}`,
		toolName,
		content: [],
		isError: false,
		timestamp: 0,
	};
}

describe("deriveTurns", () => {
	it("derives one Turn per turn_end event, carrying its own usage and tool names", () => {
		const events: AgentSessionEvent[] = [
			{ type: "turn_start" },
			{
				type: "turn_end",
				message: assistantMessage(),
				toolResults: [toolResult("search_code"), toolResult("find_symbols")],
			},
		];

		expect(deriveTurns(events)).toEqual([
			{
				turn: 1,
				model: "claude-test",
				tokensIn: 100,
				tokensOut: 20,
				cacheReadTokens: 0,
				cacheWriteTokens: 0,
				costUsd: 0.0015,
				toolCalls: 2,
				toolNames: ["search_code", "find_symbols"],
			},
		]);
	});

	it("numbers turns 1-based in stream order across several turns", () => {
		const events: AgentSessionEvent[] = [
			{ type: "turn_end", message: assistantMessage(), toolResults: [] },
			{ type: "turn_end", message: assistantMessage(), toolResults: [toolResult("hover")] },
		];

		const turns = deriveTurns(events);
		expect(turns.map((turn) => turn.turn)).toEqual([1, 2]);
		expect(turns[1]?.toolNames).toEqual(["hover"]);
	});

	it("reports zero usage for a turn_end whose message is not an assistant reply", () => {
		const events: AgentSessionEvent[] = [
			{
				type: "turn_end",
				message: { role: "toolResult", toolCallId: "x", toolName: "y", content: [], isError: false, timestamp: 0 },
				toolResults: [],
			},
		];

		expect(deriveTurns(events)).toEqual([
			{ turn: 1, model: "", tokensIn: 0, tokensOut: 0, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0, toolCalls: 0, toolNames: [] },
		]);
	});

	it("ignores non-turn_end events", () => {
		const events: AgentSessionEvent[] = [
			{ type: "agent_start" },
			{ type: "tool_execution_start", toolCallId: "call-1", toolName: "search_code", args: {} },
			{ type: "turn_end", message: assistantMessage(), toolResults: [] },
		];

		expect(deriveTurns(events)).toHaveLength(1);
	});
});

describe("summarizeRunUsage", () => {
	it("sums tokens, cost, and tool calls across every turn", () => {
		const turns = deriveTurns([
			{
				type: "turn_end",
				message: assistantMessage({ usage: usage({ input: 100, output: 20, cacheWrite: 7 }) }),
				toolResults: [toolResult("search_code")],
			},
			{
				type: "turn_end",
				message: assistantMessage({ usage: usage({ input: 50, output: 10, cacheRead: 5, cacheWrite: 3 }) }),
				toolResults: [toolResult("find_symbols"), toolResult("hover")],
			},
		]);

		expect(summarizeRunUsage(turns)).toEqual({
			turns: 2,
			tokensIn: 150,
			tokensOut: 30,
			cacheReadTokens: 5,
			cacheWriteTokens: 10,
			costUsd: 0.003,
			toolCalls: 3,
			toolNames: ["search_code", "find_symbols", "hover"],
		});
	});

	it("returns all-zero totals for no turns", () => {
		expect(summarizeRunUsage([])).toEqual({
			turns: 0,
			tokensIn: 0,
			tokensOut: 0,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
			costUsd: 0,
			toolCalls: 0,
			toolNames: [],
		});
	});
});
