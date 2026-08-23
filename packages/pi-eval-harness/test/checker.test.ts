import { describe, expect, it } from "bun:test";
import { all, expectsAll, expectsAny } from "../src/checker.ts";
import type { ToolExecution } from "../src/tool-executions.ts";

function execution(overrides: Partial<ToolExecution> = {}): ToolExecution {
	return {
		toolCallId: "call-1",
		toolName: "search_code",
		args: { pattern: "foo" },
		result: "1 match",
		isError: false,
		...overrides,
	};
}

describe("expectsAll", () => {
	it("passes with score 1 when every expectation is satisfied", async () => {
		const checker = expectsAll([{ tool: "search_code" }]);
		const result = await checker.check({ executions: [execution()] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});

	it("fails with score 0 and names each unsatisfied expectation", async () => {
		const checker = expectsAll([{ tool: "search_code" }, { tool: "find_symbols" }]);
		const result = await checker.check({ executions: [execution()] });
		expect(result.pass).toBe(false);
		expect(result.score).toBe(0);
		expect(result.errors).toEqual(["Expected find_symbols"]);
	});

	it("passes vacuously with no expectations", async () => {
		const checker = expectsAll([]);
		const result = await checker.check({ executions: [] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});
});

describe("expectsAny", () => {
	it("passes when at least one expectation is satisfied", async () => {
		const checker = expectsAny([{ tool: "find_symbols" }, { tool: "search_code" }]);
		const result = await checker.check({ executions: [execution()] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});

	it("fails with one combined OR error when none match", async () => {
		const checker = expectsAny([{ tool: "find_symbols" }, { tool: "hover" }]);
		const result = await checker.check({ executions: [execution()] });
		expect(result.pass).toBe(false);
		expect(result.errors).toEqual(["Expected at least one: find_symbols OR hover"]);
	});

	it("passes vacuously with no expectations", async () => {
		const checker = expectsAny([]);
		const result = await checker.check({ executions: [execution()] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});
});

describe("all", () => {
	it("combines checkers with the minimum score and concatenated errors", async () => {
		const combined = all(expectsAll([{ tool: "search_code" }]), expectsAll([{ tool: "find_symbols" }]));
		const result = await combined.check({ executions: [execution()] });
		expect(result.pass).toBe(false);
		expect(result.score).toBe(0);
		expect(result.errors).toEqual(["Expected find_symbols"]);
	});

	it("passes when every composed checker passes", async () => {
		const combined = all(expectsAll([{ tool: "search_code" }]), expectsAny([{ tool: "search_code" }]));
		const result = await combined.check({ executions: [execution()] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});

	it("passes vacuously with no checkers", async () => {
		const combined = all();
		const result = await combined.check({ executions: [] });
		expect(result).toEqual({ pass: true, score: 1, errors: [] });
	});
});
