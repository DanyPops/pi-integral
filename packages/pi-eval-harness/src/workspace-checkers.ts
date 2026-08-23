/**
 * Outcome checkers verifying real post-run workspace state -- what the agent actually DID, not
 * which tools it called. Ported from Alef's own `packages/core/eval/src/checker.ts`
 * (`fileExists`/`fileContains`/`lintPasses`/`any`), unchanged in scoring semantics.
 */
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Checker, CheckerContext, CheckerResult } from "./checker.js";

function missingWorkspace(label: string): CheckerResult {
	return { pass: false, score: 0, errors: [`${label}: no workspace in CheckerContext`] };
}

/** A Checker verifying a file exists in the run's workspace. Existence alone scores 0.5 -- content is unchecked. */
export function fileExists(relativePath: string): Checker {
	return {
		async check({ workspace }: CheckerContext): Promise<CheckerResult> {
			if (workspace === undefined) return missingWorkspace("fileExists");
			try {
				await readFile(join(workspace, relativePath), "utf-8");
				return { pass: true, score: 0.5, errors: [] };
			} catch {
				return { pass: false, score: 0, errors: [`File not found: ${relativePath}`] };
			}
		},
	};
}

/**
 * A Checker verifying a file contains every required substring. Graduated: 1.0 all present,
 * 0.5 some present, 0.0 none present or the file is missing.
 */
export function fileContains(relativePath: string, ...required: readonly string[]): Checker {
	return {
		async check({ workspace }: CheckerContext): Promise<CheckerResult> {
			if (workspace === undefined) return missingWorkspace("fileContains");
			let content: string;
			try {
				content = await readFile(join(workspace, relativePath), "utf-8");
			} catch {
				return { pass: false, score: 0, errors: [`File not found: ${relativePath}`] };
			}

			const missing = required.filter((value) => !content.includes(value));
			if (missing.length === 0) return { pass: true, score: 1, errors: [] };

			const found = required.length - missing.length;
			const score = found > 0 ? 0.5 : 0;
			return { pass: false, score, errors: missing.map((value) => `'${value}' not found in ${relativePath}`) };
		},
	};
}

/**
 * A Checker running a real command in the run's workspace and asserting exit code 0 -- an
 * outcome checker: verifies what the agent DID (does it still build/lint/pass tests), not what
 * it said.
 */
export function lintPasses(cmd: string, args: readonly string[] = []): Checker {
	return {
		check({ workspace }: CheckerContext): Promise<CheckerResult> {
			if (workspace === undefined) return Promise.resolve(missingWorkspace("lintPasses"));
			return new Promise((resolve) => {
				const child = spawn(cmd, [...args], { cwd: workspace, stdio: "pipe" });
				const stderr: string[] = [];
				child.stderr?.on("data", (chunk: Buffer) => stderr.push(chunk.toString()));
				child.on("close", (code) => {
					if (code === 0) {
						resolve({ pass: true, score: 1, errors: [] });
					} else {
						resolve({ pass: false, score: 0, errors: [`${cmd} exited ${code}:\n${stderr.join("").trim()}`] });
					}
				});
				child.on("error", (error) => {
					resolve({ pass: false, score: 0, errors: [`Failed to run ${cmd}: ${error.message}`] });
				});
			});
		},
	};
}

/** Composes several checkers, returning the maximum score (lenient OR) -- complements `all()`'s min-score AND. */
export function any(...checkers: readonly Checker[]): Checker {
	return {
		async check(context: CheckerContext): Promise<CheckerResult> {
			const results = await Promise.all(checkers.map((checker) => checker.check(context)));
			if (results.length === 0) return { pass: true, score: 1, errors: [] };
			return results.reduce((best, current) => (current.score >= best.score ? current : best));
		},
	};
}
