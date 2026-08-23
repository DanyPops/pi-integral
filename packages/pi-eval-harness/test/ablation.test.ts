import { describe, expect, it } from "bun:test";
import { ablate, formatAblation } from "../src/ablation.ts";
import type { TrialResult } from "../src/trials.ts";

function trial(overrides: Partial<TrialResult> = {}): TrialResult {
	return { pass: true, score: 1, durationMs: 100, tokensIn: 10, tokensOut: 5, costUsd: 0.01, ...overrides };
}

describe("ablate", () => {
	it("returns one result per config, each with its own real trial metrics", async () => {
		const results = await ablate(
			[
				{ name: "baseline", runOne: async () => trial({ tokensIn: 100 }) },
				{ name: "with-lector", runOne: async () => trial({ tokensIn: 40 }) },
			],
			3,
		);

		expect(results).toHaveLength(2);
		expect(results[0]?.metrics.meanTokensIn).toBe(100);
		expect(results[1]?.metrics.meanTokensIn).toBe(40);
	});

	it("leaves delta undefined on the baseline (first) config", async () => {
		const results = await ablate(
			[
				{ name: "baseline", runOne: async () => trial() },
				{ name: "variant", runOne: async () => trial() },
			],
			2,
		);
		expect(results[0]?.delta).toBeUndefined();
	});

	it("computes a real delta for every non-baseline config against the baseline's own metrics", async () => {
		const results = await ablate(
			[
				{ name: "baseline", runOne: async () => trial({ score: 0.5, pass: false, tokensIn: 100, durationMs: 200 }) },
				{ name: "with-lector", runOne: async () => trial({ score: 1, pass: true, tokensIn: 40, durationMs: 50 }) },
			],
			1,
		);

		const delta = results[1]?.delta;
		expect(delta).toBeDefined();
		expect(delta?.passRateDelta).toBeCloseTo(1);
		expect(delta?.meanScoreDelta).toBeCloseTo(0.5);
		expect(delta?.meanTokensInDelta).toBe(-60);
		expect(delta?.meanDurationMsDelta).toBe(-150);
	});

	it("returns an empty array for no configs", async () => {
		expect(await ablate([], 5)).toEqual([]);
	});

	it("runs n trials per config independently", async () => {
		const calls: Record<string, number> = { baseline: 0, variant: 0 };
		await ablate(
			[
				{
					name: "baseline",
					runOne: async () => {
						calls["baseline"]!++;
						return trial();
					},
				},
				{
					name: "variant",
					runOne: async () => {
						calls["variant"]!++;
						return trial();
					},
				},
			],
			4,
		);
		expect(calls["baseline"]).toBe(4);
		expect(calls["variant"]).toBe(4);
	});
});

describe("formatAblation", () => {
	it("renders every config's own metrics line, with a delta line for non-baseline configs", async () => {
		const results = await ablate(
			[
				{ name: "baseline", runOne: async () => trial({ tokensIn: 100 }) },
				{ name: "with-lector", runOne: async () => trial({ tokensIn: 40 }) },
			],
			1,
		);
		const report = formatAblation("rename-runCheckout", results);
		expect(report).toContain("=== Ablation: rename-runCheckout ===");
		expect(report).toContain("baseline");
		expect(report).toContain("with-lector");
		expect(report).toContain("(vs baseline)");
		expect(report).toContain("Δtokens_in=-60");
	});
});
