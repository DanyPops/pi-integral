import { describe, expect, it } from "bun:test";
import { describeToolCall, matchesToolCall } from "../src/tool-call.ts";
import type { ToolExecution } from "../src/tool-executions.ts";

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
	return {
		toolCallId: "call-1",
		toolName: "search_code",
		args: { pattern: "foo", directory: "src" },
		result: "1 match",
		isError: false,
		...overrides,
	};
}

describe("matchesToolCall", () => {
	it("matches a single tool name", () => {
		expect(matchesToolCall(execution(), { tool: "search_code" })).toBe(true);
		expect(matchesToolCall(execution(), { tool: "find_symbols" })).toBe(false);
	});

	it("matches any tool name in an array (OR across the tool dimension)", () => {
		expect(matchesToolCall(execution(), { tool: ["find_symbols", "search_code"] })).toBe(true);
		expect(matchesToolCall(execution(), { tool: ["find_symbols", "hover"] })).toBe(false);
	});

	it("matches a target field by substring", () => {
		expect(matchesToolCall(execution(), { tool: "search_code", target: { pattern: "fo" } })).toBe(true);
		expect(matchesToolCall(execution(), { tool: "search_code", target: { pattern: "bar" } })).toBe(false);
	});

	it("matches a target field by regex", () => {
		expect(matchesToolCall(execution(), { tool: "search_code", target: { pattern: /^foo$/ } })).toBe(true);
		expect(matchesToolCall(execution(), { tool: "search_code", target: { pattern: /^bar$/ } })).toBe(false);
	});

	it("requires every non-undefined target field to match", () => {
		const expectation = { tool: "search_code", target: { pattern: "foo", directory: "src" } };
		expect(matchesToolCall(execution(), expectation)).toBe(true);
		expect(matchesToolCall(execution(), { tool: "search_code", target: { pattern: "foo", directory: "test" } })).toBe(false);
	});

	it("matches an arbitrary target key beyond the named path/pattern/symbol/url fields", () => {
		expect(matchesToolCall(execution(), { tool: "search_code", target: { directory: "src" } })).toBe(true);
	});

	it("matches produces against a real, non-string JSON result", () => {
		const jsonExecution = execution({ result: { matches: 3 } });
		expect(matchesToolCall(jsonExecution, { tool: "search_code", produces: "matches" })).toBe(true);
		expect(matchesToolCall(jsonExecution, { tool: "search_code", produces: "nothing" })).toBe(false);
	});

	it("matches produces by regex against the real result", () => {
		expect(matchesToolCall(execution(), { tool: "search_code", produces: /^1 match$/ })).toBe(true);
	});
});

describe("describeToolCall", () => {
	it("describes a tool-only expectation", () => {
		expect(describeToolCall({ tool: "search_code" })).toBe("search_code");
	});

	it("describes an expectation with a target and produces", () => {
		expect(describeToolCall({ tool: "search_code", target: { pattern: "foo" }, produces: "bar" })).toBe("search_code on pattern=foo → bar");
	});

	it("joins several acceptable tool names with |", () => {
		expect(describeToolCall({ tool: ["search_code", "find_symbols"] })).toBe("search_code|find_symbols");
	});
});
