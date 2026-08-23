import { describeToolCall, matchesToolCall, type ToolCall } from "./tool-call.js";
import type { ToolExecution } from "./tool-executions.js";

/** Outcome of a Checker.check() call with graduated scoring, ported from Alef's own eval framework. */
export interface CheckerResult {
	readonly pass: boolean;
	/** Graduated score 0-1: 0.0 hard fail, 0.5 partial, 1.0 full pass. */
	readonly score: number;
	readonly errors: readonly string[];
}

/**
 * Runtime context passed to a Checker -- the real completed tool executions from one run, plus
 * (when the run actually had a real workspace directory) its absolute path, for a checker that
 * verifies real post-run workspace state rather than which tools were called. Optional: a
 * checker that only inspects `executions` (matching/rollup checks) never needs it, and every
 * existing construction of this context predates the field.
 */
export interface CheckerContext {
	readonly executions: readonly ToolExecution[];
	readonly workspace?: string;
}

/** A pure, deterministic verifier over one run's real tool executions. */
export interface Checker {
	check(context: CheckerContext): CheckerResult | Promise<CheckerResult>;
}

/**
 * A Checker requiring every expectation to be satisfied by at least one execution (AND
 * semantics) -- ported from Alef's `Evaluation.expects`.
 */
export function expectsAll(expectations: readonly ToolCall[]): Checker {
	return {
		check({ executions }: CheckerContext): CheckerResult {
			const errors = expectations
				.filter((expectation) => !executions.some((execution) => matchesToolCall(execution, expectation)))
				.map((expectation) => `Expected ${describeToolCall(expectation)}`);
			return { pass: errors.length === 0, score: errors.length === 0 ? 1 : 0, errors };
		},
	};
}

/**
 * A Checker requiring at least one expectation to be satisfied by at least one execution (OR
 * semantics) -- ported from Alef's `Evaluation.expectsAny`.
 */
export function expectsAny(expectations: readonly ToolCall[]): Checker {
	return {
		check({ executions }: CheckerContext): CheckerResult {
			if (expectations.length === 0) return { pass: true, score: 1, errors: [] };
			const satisfied = expectations.some((expectation) => executions.some((execution) => matchesToolCall(execution, expectation)));
			if (satisfied) return { pass: true, score: 1, errors: [] };
			const description = expectations.map((expectation) => describeToolCall(expectation)).join(" OR ");
			return { pass: false, score: 0, errors: [`Expected at least one: ${description}`] };
		},
	};
}

/**
 * Composes several checkers with AND semantics: the combined score is the minimum of every
 * checker's own score, and every checker's errors are concatenated -- ported from Alef's
 * `checker.ts` `all()`.
 */
export function all(...checkers: readonly Checker[]): Checker {
	return {
		async check(context: CheckerContext): Promise<CheckerResult> {
			const results = await Promise.all(checkers.map((checker) => checker.check(context)));
			const errors = results.flatMap((result) => result.errors);
			const score = results.length === 0 ? 1 : Math.min(...results.map((result) => result.score));
			return { pass: errors.length === 0, score, errors };
		},
	};
}
