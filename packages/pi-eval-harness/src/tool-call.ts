import type { ToolExecution } from "./tool-executions.js";

/**
 * One expected tool interaction, ported from Alef's own `packages/core/eval` evaluation
 * framework (`ToolCall`/`matchesToolCall`/`expects`/`expectsAny`) -- adapted from Alef's OTel
 * `SpanRecord[]` onto this package's own `ToolExecution[]` (see `tool-executions.ts`), the real
 * projection of a Pi `AgentSessionEvent` stream's completed tool calls.
 *
 * tool    -- which tool was invoked (OR semantics across the array).
 * target  -- what the tool was called on, matched against its real input args.
 * produces -- what the tool's output must contain.
 *
 * All non-undefined fields must match for the expectation to be satisfied.
 */
export interface ToolCall {
	/** Acceptable tool name(s) -- any one satisfies the call dimension. */
	readonly tool: string | readonly string[];
	/** Fields that must appear in the tool's input args. */
	readonly target?: {
		/** File path the tool operated on (substring or regex). */
		readonly path?: string | RegExp;
		/** Search pattern used (substring or regex). */
		readonly pattern?: string | RegExp;
		/** Symbol name targeted (substring or regex). */
		readonly symbol?: string | RegExp;
		/** URL fetched (substring or regex). */
		readonly url?: string | RegExp;
		/** Arbitrary payload field -- key/value or regex. */
		readonly [key: string]: string | RegExp | undefined;
	};
	/** What the tool's output must contain (substring or regex). */
	readonly produces?: string | RegExp;
}

function matchValue(actual: string, expected: string | RegExp): boolean {
	return expected instanceof RegExp ? expected.test(actual) : actual.includes(expected);
}

/** Stringifies a real tool result (which may be any JSON value, not only text) for `produces` matching. */
function stringifyResult(result: unknown): string {
	if (typeof result === "string") return result;
	try {
		return JSON.stringify(result) ?? "";
	} catch {
		return String(result);
	}
}

function argValue(args: unknown, key: string): string {
	if (typeof args !== "object" || args === null) return "";
	const value = (args as Record<string, unknown>)[key];
	return typeof value === "string" ? value : "";
}

/** Whether one real completed tool execution satisfies a tool-call expectation. */
export function matchesToolCall(execution: ToolExecution, expectation: ToolCall): boolean {
	const tools = Array.isArray(expectation.tool) ? expectation.tool : [expectation.tool];
	if (!tools.some((name) => execution.toolName === name)) return false;

	if (expectation.target) {
		for (const [key, pattern] of Object.entries(expectation.target)) {
			if (pattern === undefined) continue;
			if (!matchValue(argValue(execution.args, key), pattern)) return false;
		}
	}

	if (expectation.produces !== undefined) {
		if (!matchValue(stringifyResult(execution.result), expectation.produces)) return false;
	}

	return true;
}

/** Formats a tool-call expectation as a human-readable description for a checker error. */
export function describeToolCall(expectation: ToolCall): string {
	const tools = Array.isArray(expectation.tool) ? expectation.tool.join("|") : expectation.tool;
	const target = expectation.target
		? ` on ${Object.entries(expectation.target)
				.filter(([, value]) => value !== undefined)
				.map(([key, value]) => `${key}=${value instanceof RegExp ? value.source : String(value)}`)
				.join(", ")}`
		: "";
	const produces =
		expectation.produces !== undefined
			? ` → ${expectation.produces instanceof RegExp ? expectation.produces.source : expectation.produces}`
			: "";
	return `${tools}${target}${produces}`;
}
