import { describe, expect, it } from "bun:test";
import { aggregateTrials, MaxErrorRateExceeded, runTrials, type TrialResult } from "../src/trials.ts";

function trial(overrides: Partial<TrialResult> = {}): TrialResult {
	return {
		pass: true,
		score: 1,
		durationMs: 100,
		tokensIn: 10,
		tokensOut: 5,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		costUsd: 0.01,
		...overrides,
	};
}

describe("aggregateTrials", () => {
	it("computes pass rate, mean score, and min/max across mixed trials", () => {
		const metrics = aggregateTrials([
			trial({ score: 1, pass: true }),
			trial({ score: 0, pass: false }),
			trial({ score: 0.5, pass: false }),
		]);
		expect(metrics.trials).toBe(3);
		expect(metrics.passes).toBe(1);
		expect(metrics.passRate).toBeCloseTo(1 / 3);
		expect(metrics.meanScore).toBeCloseTo(0.5);
		expect(metrics.minScore).toBe(0);
		expect(metrics.maxScore).toBe(1);
	});

	it("computes variance as the mean squared deviation from the mean score", () => {
		const metrics = aggregateTrials([trial({ score: 0 }), trial({ score: 1 })]);
		// mean=0.5, deviations -0.5/+0.5, squared 0.25 each, mean 0.25
		expect(metrics.variance).toBeCloseTo(0.25);
	});

	it("means duration, tokens, and cost across trials", () => {
		const metrics = aggregateTrials([
			trial({ durationMs: 100, tokensIn: 10, tokensOut: 5, costUsd: 0.01 }),
			trial({ durationMs: 300, tokensIn: 30, tokensOut: 15, costUsd: 0.03 }),
		]);
		expect(metrics.meanDurationMs).toBe(200);
		expect(metrics.meanTokensIn).toBe(20);
		expect(metrics.meanTokensOut).toBe(10);
		expect(metrics.meanCostUsd).toBeCloseTo(0.02);
	});

	it("means real cache read/write tokens across trials -- the dominant real context/cost component under prompt caching", () => {
		const metrics = aggregateTrials([
			trial({ cacheReadTokens: 1000, cacheWriteTokens: 200 }),
			trial({ cacheReadTokens: 3000, cacheWriteTokens: 600 }),
		]);
		expect(metrics.meanCacheReadTokens).toBe(2000);
		expect(metrics.meanCacheWriteTokens).toBe(400);
	});

	it("throws for an empty trial list rather than producing NaN statistics", () => {
		expect(() => aggregateTrials([])).toThrow("at least one trial result is required");
	});

	it("throws MaxErrorRateExceeded when too many trials errored, naming the first real error", () => {
		const results = [trial({ error: "boom 1" }), trial({ error: "boom 2" }), trial()];
		expect(() => aggregateTrials(results, { maxErrorRate: 0.5 })).toThrow(MaxErrorRateExceeded);
		try {
			aggregateTrials(results, { maxErrorRate: 0.5 });
		} catch (error) {
			expect(error).toBeInstanceOf(MaxErrorRateExceeded);
			if (error instanceof MaxErrorRateExceeded) {
				expect(error.errorCount).toBe(2);
				expect(error.totalTrials).toBe(3);
				expect(error.message).toContain("boom 1");
			}
		}
	});

	it("does not guard against errors at all when maxErrorRate is left at its default (disabled)", () => {
		const results = [trial({ error: "boom" }), trial({ error: "boom" }), trial({ error: "boom" })];
		expect(() => aggregateTrials(results)).not.toThrow();
	});
});

describe("runTrials", () => {
	it("runs the trial function n times and aggregates the real results", async () => {
		let calls = 0;
		const metrics = await runTrials(async () => {
			calls++;
			return trial({ score: 1, pass: true });
		}, 5);
		expect(calls).toBe(5);
		expect(metrics.trials).toBe(5);
		expect(metrics.passRate).toBe(1);
	});

	it("converts a rejected trial into a real errored TrialResult instead of aborting the batch", async () => {
		let calls = 0;
		const metrics = await runTrials(async () => {
			calls++;
			if (calls === 2) throw new Error("trial 2 crashed");
			return trial();
		}, 3);
		expect(calls).toBe(3);
		expect(metrics.trials).toBe(3);
		expect(metrics.passes).toBe(2);
	});

	it("respects a lower concurrency than n, still running every trial", async () => {
		let concurrentActive = 0;
		let maxConcurrentObserved = 0;
		const metrics = await runTrials(
			async () => {
				concurrentActive++;
				maxConcurrentObserved = Math.max(maxConcurrentObserved, concurrentActive);
				await new Promise((resolve) => setTimeout(resolve, 10));
				concurrentActive--;
				return trial();
			},
			6,
			{ concurrency: 2 },
		);
		expect(metrics.trials).toBe(6);
		expect(maxConcurrentObserved).toBeLessThanOrEqual(2);
	});
});
