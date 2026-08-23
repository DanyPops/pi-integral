/**
 * Runs one scenario under several named tool-availability configs and diffs the results --
 * ported from djinn's own `testkit/eval_ablation.go` (`AblationConfig`/`AblationResult`/
 * `AblationDelta`/`Ablate()`) and `eval_report.go`'s `FormatAblation()`. The first config is the
 * baseline; every later config's own TrialMetrics get a delta computed against it.
 */
import { type RunTrialsOptions, runTrials, type TrialMetrics, type TrialResult } from "./trials.js";

/** One named variant of the scenario -- e.g. "baseline" (Pi's own built-in tools) vs "with-lector" (the same run, Lector's tools also registered). */
export interface AblationConfig {
	readonly name: string;
	/** Runs one real trial under this config. Whatever varies between arms (which extensions load, which tools are registered) lives inside this closure. */
	readonly runOne: () => Promise<TrialResult>;
}

/** The performance difference of one config's TrialMetrics vs the baseline (first) config's. */
export interface AblationDelta {
	readonly passRateDelta: number;
	readonly meanScoreDelta: number;
	readonly meanDurationMsDelta: number;
	readonly meanTokensInDelta: number;
}

/** One config's own trial metrics, plus its delta vs baseline. `delta` is undefined for the baseline itself. */
export interface AblationResult {
	readonly config: AblationConfig;
	readonly metrics: TrialMetrics;
	readonly delta?: AblationDelta;
}

/**
 * Runs `n` trials of every config (sequentially, config by config -- each config's own trials
 * still run at `options.concurrency` internally) and returns side-by-side results. Configs are
 * independent scenarios in the caller's own domain (e.g. real spawned `pi` processes with
 * different extension sets); this function only orchestrates trial counts and diffs.
 */
export async function ablate(configs: readonly AblationConfig[], n: number, options: RunTrialsOptions = {}): Promise<AblationResult[]> {
	if (configs.length === 0) return [];

	const results: AblationResult[] = [];
	for (const config of configs) {
		results.push({ config, metrics: await runTrials(config.runOne, n, options) });
	}

	const baseline = results[0]?.metrics;
	if (baseline === undefined) return results;

	return results.map((result, index) => {
		if (index === 0) return result;
		const metrics = result.metrics;
		return {
			...result,
			delta: {
				passRateDelta: metrics.passRate - baseline.passRate,
				meanScoreDelta: metrics.meanScore - baseline.meanScore,
				meanDurationMsDelta: metrics.meanDurationMs - baseline.meanDurationMs,
				meanTokensInDelta: metrics.meanTokensIn - baseline.meanTokensIn,
			},
		};
	});
}

function signed(value: number, digits: number): string {
	const rounded = value.toFixed(digits);
	return value >= 0 ? `+${rounded}` : rounded;
}

/** Renders a human-readable ablation comparison table -- ported from djinn's `FormatAblation()`. */
export function formatAblation(label: string, results: readonly AblationResult[]): string {
	const lines: string[] = [`=== Ablation: ${label} ===`];
	for (const result of results) {
		const m = result.metrics;
		lines.push(
			`  ${result.config.name.padEnd(14)}  pass_rate=${m.passRate.toFixed(2)}  mean_score=${m.meanScore.toFixed(2)}  mean_duration_ms=${m.meanDurationMs.toFixed(0)}  tokens_in=${m.meanTokensIn.toFixed(0)}`,
		);
		if (result.delta) {
			const d = result.delta;
			lines.push(
				`  ${"(vs baseline)".padEnd(14)}  Δpass_rate=${signed(d.passRateDelta, 2)}  Δscore=${signed(d.meanScoreDelta, 2)}  Δduration_ms=${signed(d.meanDurationMsDelta, 0)}  Δtokens_in=${signed(d.meanTokensInDelta, 0)}`,
			);
		}
	}
	return lines.join("\n");
}
