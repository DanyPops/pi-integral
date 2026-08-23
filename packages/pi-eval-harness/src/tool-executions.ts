import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/** One completed tool call, paired from its real tool_execution_start/tool_execution_end events. */
export interface ToolExecution {
	readonly toolCallId: string;
	readonly toolName: string;
	readonly args: unknown;
	readonly result: unknown;
	readonly isError: boolean;
}

/**
 * Pairs each `tool_execution_start` with its matching `tool_execution_end` by `toolCallId`, in
 * completion order. A start with no matching end (a call still running when the stream ends, or
 * aborted mid-flight) is dropped -- only a fully finished call is real trace data a checker can
 * score.
 */
export function extractToolExecutions(events: readonly AgentSessionEvent[]): ToolExecution[] {
	const starts = new Map<string, { toolName: string; args: unknown }>();
	const executions: ToolExecution[] = [];
	for (const event of events) {
		if (event.type === "tool_execution_start") {
			starts.set(event.toolCallId, { toolName: event.toolName, args: event.args });
			continue;
		}
		if (event.type === "tool_execution_end") {
			const start = starts.get(event.toolCallId);
			if (start === undefined) continue;
			executions.push({
				toolCallId: event.toolCallId,
				toolName: start.toolName,
				args: start.args,
				result: event.result,
				isError: event.isError,
			});
		}
	}
	return executions;
}
