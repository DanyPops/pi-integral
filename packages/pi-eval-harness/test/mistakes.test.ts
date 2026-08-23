import { describe, expect, it } from "bun:test";
import { detectLoop, summarizeMistakes } from "../src/mistakes.ts";
import type { ToolExecution } from "../src/tool-executions.ts";

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
	return { toolCallId: "call-1", toolName: "search_code", args: {}, result: "ok", isError: false, ...overrides };
}

describe("summarizeMistakes", () => {
	it("reports zero mistakes for a clean run", () => {
		expect(summarizeMistakes([execution(), execution({ toolCallId: "call-2" })])).toEqual({
			totalExecutions: 2,
			errorCount: 0,
			errorRate: 0,
		});
	});

	it("counts real isError: true executions and computes the correct rate", () => {
		const executions = [
			execution({ toolCallId: "call-1", isError: true }),
			execution({ toolCallId: "call-2", isError: false }),
			execution({ toolCallId: "call-3", isError: true }),
			execution({ toolCallId: "call-4", isError: false }),
		];
		expect(summarizeMistakes(executions)).toEqual({ totalExecutions: 4, errorCount: 2, errorRate: 0.5 });
	});

	it("reports an all-zero summary for no executions at all, not NaN", () => {
		expect(summarizeMistakes([])).toEqual({ totalExecutions: 0, errorCount: 0, errorRate: 0 });
	});
});

describe("detectLoop", () => {
	it("does not detect a loop in a normal, varied run", () => {
		const executions = [execution({ toolName: "search_code" }), execution({ toolName: "find_symbols" }), execution({ toolName: "read" })];
		expect(detectLoop(executions)).toEqual({ loopDetected: false, maxToolCallCount: 1 });
	});

	it("detects a real repeated-tool-name pattern past the default threshold, naming the tool", () => {
		const executions = Array.from({ length: 11 }, (_, index) => execution({ toolCallId: `call-${index}`, toolName: "run_command" }));
		expect(detectLoop(executions)).toEqual({ loopDetected: true, loopTool: "run_command", maxToolCallCount: 11 });
	});

	it("does not detect a loop exactly at the threshold -- only strictly past it", () => {
		const executions = Array.from({ length: 10 }, (_, index) => execution({ toolCallId: `call-${index}`, toolName: "run_command" }));
		expect(detectLoop(executions)).toEqual({ loopDetected: false, maxToolCallCount: 10 });
	});

	it("respects a real custom threshold", () => {
		const executions = Array.from({ length: 4 }, (_, index) => execution({ toolCallId: `call-${index}`, toolName: "run_command" }));
		expect(detectLoop(executions, 3)).toEqual({ loopDetected: true, loopTool: "run_command", maxToolCallCount: 4 });
	});

	it("reports no loop for an empty run", () => {
		expect(detectLoop([])).toEqual({ loopDetected: false, maxToolCallCount: 0 });
	});
});
