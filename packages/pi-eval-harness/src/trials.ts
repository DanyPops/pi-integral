/**
 * Multi-trial aggregation over N real, non-deterministic runs of the same scenario -- ported
 * from Alef's own `EvaluationRunner.runN` (pass@k, variance, min/max score, a bounded
 * concurrency cap) and djinn's `TrialMetrics` (pass rate, mean score/latency/tokens) shape.
 * A single real live-LLM trial's score is noise, not signal -- this is what turns it into one.
 */

/** One real trial's own outcome. `error` set means the trial itself failed to run to completion -- a real infrastructure/runtime failure, distinct from a checker legitimately scoring it 0. */
export interface TrialResult {
	readonly pass: boolean;
	readonly score: number;
	readonly durationMs: number;
	readonly tokensIn: number;
	readonly tokensOut: number;
	/** Real cache-read/cache-write tokens -- under prompt caching, the dominant real component of total context size; tokensIn alone (a provider's own incremental, non-cached count) understates it. */
	readonly cacheReadTokens: number;
	readonly cacheWriteTokens: number;
	readonly costUsd: number;
	readonly error?: string;
}

/** Aggregate statistics across N trials of one scenario. */
export interface TrialMetrics {
	readonly trials: number;
	readonly passes: number;
	readonly passRate: number;
	readonly meanScore: number;
	readonly variance: number;
	readonly minScore: number;
	readonly maxScore: number;
	readonly meanDurationMs: number;
	readonly meanTokensIn: number;
	readonly meanTokensOut: number;
	readonly meanCacheReadTokens: number;
	readonly meanCacheWriteTokens: number;
	readonly meanCostUsd: number;
}

/**
 * Thrown when too many trials errored outright to trust the aggregate as a real measurement --
 * ported from Alef's own `[MaxErrorRate]` guard. Without this, a scenario that errors on every
 * trial would silently aggregate to "0% pass", indistinguishable from a real, measured failure.
 */
export class MaxErrorRateExceeded extends Error {
	constructor(
		readonly errorRate: number,
		readonly maxErrorRate: number,
		readonly errorCount: number,
		readonly totalTrials: number,
		firstError: string | undefined,
	) {
		super(
			`${(errorRate * 100).toFixed(0)}% of trials errored (${errorCount}/${totalTrials}), threshold ${(maxErrorRate * 100).toFixed(0)}%. First error: ${firstError ?? "unknown"}`,
		);
		this.name = "MaxErrorRateExceeded";
	}
}

function mean(values: readonly number[]): number {
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * Aggregates already-collected trial results into TrialMetrics. Throws MaxErrorRateExceeded if
 * `maxErrorRate` (0-1, default 0 = disabled) is exceeded by the fraction of errored trials.
 */
export function aggregateTrials(results: readonly TrialResult[], options: { readonly maxErrorRate?: number } = {}): TrialMetrics {
	if (results.length === 0) throw new Error("aggregateTrials: at least one trial result is required");

	const maxErrorRate = options.maxErrorRate ?? 0;
	if (maxErrorRate > 0) {
		const errored = results.filter((result) => result.error !== undefined);
		const errorRate = errored.length / results.length;
		if (errorRate > maxErrorRate) {
			throw new MaxErrorRateExceeded(errorRate, maxErrorRate, errored.length, results.length, errored[0]?.error);
		}
	}

	const scores = results.map((result) => result.score);
	const passes = results.filter((result) => result.pass).length;
	const meanScore = mean(scores);

	return {
		trials: results.length,
		passes,
		passRate: passes / results.length,
		meanScore,
		variance: mean(scores.map((score) => (score - meanScore) ** 2)),
		minScore: Math.min(...scores),
		maxScore: Math.max(...scores),
		meanDurationMs: mean(results.map((result) => result.durationMs)),
		meanTokensIn: mean(results.map((result) => result.tokensIn)),
		meanTokensOut: mean(results.map((result) => result.tokensOut)),
		meanCacheReadTokens: mean(results.map((result) => result.cacheReadTokens)),
		meanCacheWriteTokens: mean(results.map((result) => result.cacheWriteTokens)),
		meanCostUsd: mean(results.map((result) => result.costUsd)),
	};
}

export interface RunTrialsOptions {
	/** Trials run concurrently at once. Default 3, matching Alef's own ALEF_EVAL_CONCURRENCY default -- real LLM providers rate-limit. */
	readonly concurrency?: number;
	readonly maxErrorRate?: number;
}

/**
 * Runs `runOne` (one real trial of a scenario) `n` times at a bounded concurrency, then
 * aggregates. A rejected `runOne` call becomes a TrialResult with `error` set (score 0, pass
 * false) rather than aborting the whole batch -- one crashed trial should not lose every other
 * trial's own real data.
 */
export async function runTrials(runOne: () => Promise<TrialResult>, n: number, options: RunTrialsOptions = {}): Promise<TrialMetrics> {
	const concurrency = options.concurrency ?? 3;
	const results: TrialResult[] = [];

	for (let i = 0; i < n; i += concurrency) {
		const batchSize = Math.min(concurrency, n - i);
		const batch = await Promise.all(
			Array.from({ length: batchSize }, async (): Promise<TrialResult> => {
				try {
					return await runOne();
				} catch (error) {
					return {
						pass: false,
						score: 0,
						durationMs: 0,
						tokensIn: 0,
						tokensOut: 0,
						cacheReadTokens: 0,
						cacheWriteTokens: 0,
						costUsd: 0,
						error: error instanceof Error ? error.message : String(error),
					};
				}
			}),
		);
		results.push(...batch);
	}

	return aggregateTrials(results, options.maxErrorRate !== undefined ? { maxErrorRate: options.maxErrorRate } : {});
}
