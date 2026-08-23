/**
 * Mistake-rate and loop-detection rollups over one run's real tool executions -- ported from
 * djinn's own `LoopThreshold`/`LoopDetected`/`LoopTool` (`testkit/eval_evaluation.go`/
 * `eval_runner.go`): the exact edit-build-fail-retry failure mode the JetBrains Rider blog
 * post's own worked example showed in detail (11 edit/build cycles fighting the compiler).
 */
import type { ToolExecution } from "./tool-executions.js";

/** Real, per-execution error signal rolled up across a whole run. */
export interface MistakeSummary {
	readonly totalExecutions: number;
	/** Count of tool_execution_end events with isError: true. */
	readonly errorCount: number;
	/** errorCount / totalExecutions; 0 for a run with no executions at all. */
	readonly errorRate: number;
}

/** Rolls up isError across every completed execution in a run. */
export function summarizeMistakes(executions: readonly ToolExecution[]): MistakeSummary {
	const errorCount = executions.filter((execution) => execution.isError).length;
	return {
		totalExecutions: executions.length,
		errorCount,
		errorRate: executions.length === 0 ? 0 : errorCount / executions.length,
	};
}

export interface LoopDetectionResult {
	readonly loopDetected: boolean;
	/** The tool name that triggered detection. Present only when loopDetected is true. */
	readonly loopTool?: string;
	/** The real highest same-tool call count observed, regardless of whether it crossed the threshold. */
	readonly maxToolCallCount: number;
}

/**
 * Detects a real repeated-tool-call pattern: the same tool name called more than `threshold`
 * times in one run (default 10, matching djinn's own default). A simple total-count threshold
 * per tool name, not a strict-consecutive-run check -- matching djinn's own definition.
 */
export function detectLoop(executions: readonly ToolExecution[], threshold = 10): LoopDetectionResult {
	const counts = new Map<string, number>();
	for (const execution of executions) {
		counts.set(execution.toolName, (counts.get(execution.toolName) ?? 0) + 1);
	}

	let maxToolCallCount = 0;
	let loopTool: string | undefined;
	for (const [toolName, count] of counts) {
		if (count > maxToolCallCount) {
			maxToolCallCount = count;
			loopTool = toolName;
		}
	}

	if (maxToolCallCount > threshold && loopTool !== undefined) {
		return { loopDetected: true, loopTool, maxToolCallCount };
	}
	return { loopDetected: false, maxToolCallCount };
}
