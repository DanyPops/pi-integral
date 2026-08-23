import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";

/**
 * One real LLM turn, derived directly from a `turn_end` event -- unlike Alef's own
 * `deriveturns` (which had to reconstruct turn boundaries by scanning for OTel `chat ` spans
 * and attributing trailing command spans to them), Pi's real `AgentEvent` union already emits
 * an explicit `turn_end` per turn, carrying the assistant's own message (with real `Usage`) and
 * that turn's own `toolResults` directly -- no reconstruction needed.
 */
export interface Turn {
	/** 1-based turn index within the run. */
	readonly turn: number;
	/** Model id from the assistant message, empty when the turn's message isn't an assistant reply. */
	readonly model: string;
	readonly tokensIn: number;
	readonly tokensOut: number;
	readonly cacheReadTokens: number;
	/** Real cost in USD from Usage.cost.total, when the provider reports pricing. */
	readonly costUsd: number;
	/** Number of tool calls dispatched from this turn. */
	readonly toolCalls: number;
	/** Names of tools called in this turn, in dispatch order. */
	readonly toolNames: readonly string[];
}

/** Derives one Turn per real `turn_end` event, in the stream's own order. */
export function deriveTurns(events: readonly AgentSessionEvent[]): Turn[] {
	const turns: Turn[] = [];
	let turnIndex = 0;
	for (const event of events) {
		if (event.type !== "turn_end") continue;
		turnIndex++;
		const message = event.message;
		const isAssistant = message.role === "assistant";
		const usage = isAssistant ? message.usage : undefined;
		turns.push({
			turn: turnIndex,
			model: isAssistant ? message.model : "",
			tokensIn: usage?.input ?? 0,
			tokensOut: usage?.output ?? 0,
			cacheReadTokens: usage?.cacheRead ?? 0,
			costUsd: usage?.cost.total ?? 0,
			toolCalls: event.toolResults.length,
			toolNames: event.toolResults.map((result) => result.toolName),
		});
	}
	return turns;
}

/** Aggregate token/cost/turn/tool-call totals across a whole run's turns. */
export interface RunUsageSummary {
	readonly turns: number;
	readonly tokensIn: number;
	readonly tokensOut: number;
	readonly cacheReadTokens: number;
	readonly costUsd: number;
	readonly toolCalls: number;
	/** Every tool name called across the whole run, in dispatch order. */
	readonly toolNames: readonly string[];
}

/** Rolls up per-turn Turn records into whole-run usage totals. */
export function summarizeRunUsage(turns: readonly Turn[]): RunUsageSummary {
	return {
		turns: turns.length,
		tokensIn: turns.reduce((sum, turn) => sum + turn.tokensIn, 0),
		tokensOut: turns.reduce((sum, turn) => sum + turn.tokensOut, 0),
		cacheReadTokens: turns.reduce((sum, turn) => sum + turn.cacheReadTokens, 0),
		costUsd: turns.reduce((sum, turn) => sum + turn.costUsd, 0),
		toolCalls: turns.reduce((sum, turn) => sum + turn.toolCalls, 0),
		toolNames: turns.flatMap((turn) => turn.toolNames),
	};
}
