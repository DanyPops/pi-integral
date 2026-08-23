#!/usr/bin/env bun
/**
 * Opt-in-only real-model smoke test. Spawns a genuine `pi` process against Anthropic via
 * Google Vertex (no faux provider, no scripted tool calls -- a real model deciding what to do),
 * then runs the captured AgentSessionEvent stream through extractToolExecutions/deriveTurns/
 * summarizeMistakes/detectLoop to confirm they handle a real model's own event shape/ordering,
 * not just the faux provider's own conveniences every other test in this package relies on.
 *
 * Never run automatically: this is a real, billed API call. Run explicitly:
 *   bun scripts/real-llm-smoke-test.ts
 *
 * Requires real Google Cloud ADC credentials on this machine (gcloud auth application-default
 * login) -- passed explicitly via GOOGLE_APPLICATION_CREDENTIALS rather than relying on
 * pi-process-harness's isolated HOME (which would otherwise hide the real ~/.config/gcloud
 * credential file this provider needs).
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionEvent } from "@earendil-works/pi-coding-agent";
import { spawnRealPiProcess, waitForRpcEvent } from "@danypops/pi-process-harness";
import { deriveTurns, detectLoop, extractToolExecutions, summarizeMistakes, summarizeRunUsage } from "../src/index.ts";

async function main(): Promise<void> {
	const cwd = mkdtempSync(join(tmpdir(), "pi-eval-harness-real-llm-smoke-"));
	writeFileSync(
		join(cwd, "example.ts"),
		"export function add(a: number, b: number): number {\n\treturn a + b;\n}\n\nexport const VERSION = '1.0.0';\n",
	);

	const adcPath = join(homedir(), ".config", "gcloud", "application_default_credentials.json");

	// anthropic-vertex is a custom provider from a real npm package (@twogiants/pi-anthropic-vertex),
	// not a built-in Pi provider -- passed explicitly as an extension so a genuinely isolated home
	// (no ambient pi-lector or any other real profile extension contaminating a baseline arm) still
	// recognizes it. Confirmed installed at this real path in the operator's own npm package cache.
	const VERTEX_PROVIDER_EXTENSION = join(homedir(), ".pi/agent/npm/node_modules/@twogiants/pi-anthropic-vertex/index.ts");
	const proc = spawnRealPiProcess({
		extensions: [VERTEX_PROVIDER_EXTENSION],
		extraArgs: ["--provider", "anthropic-vertex", "--model", "claude-sonnet-5"],
		cwd,
		env: { GOOGLE_APPLICATION_CREDENTIALS: adcPath },
	});

	const events: AgentSessionEvent[] = [];
	proc.onEvent((event) => {
		events.push(event);
		console.log(`[event] ${event.type}`);
	});
	proc.sendPrompt("Read the file example.ts in your current directory and tell me, in one short sentence, what it exports.");

	console.log("Waiting for the real model to reply (agent_end)...");
	try {
		await waitForRpcEvent(events, (event): event is Extract<AgentSessionEvent, { type: "agent_end" }> => event.type === "agent_end", {
			timeoutMs: 60_000,
		});
	} catch (error) {
		console.error("\n--- stderr ---");
		console.error(proc.stderr);
		console.error("--- exit code ---", proc.exitCode);
		throw error;
	} finally {
		await proc.dispose();
		rmSync(cwd, { recursive: true, force: true });
	}

	console.log(`\nCaptured ${events.length} real events: ${events.map((event) => event.type).join(", ")}`);

	const executions = extractToolExecutions(events);
	console.log(`\nReal tool executions (${executions.length}):`);
	for (const execution of executions) {
		console.log(`  ${execution.toolName} isError=${execution.isError}`);
	}

	const turns = deriveTurns(events);
	const usage = summarizeRunUsage(turns);
	console.log(`\nTurns: ${turns.length}`);
	console.log(`Usage: tokensIn=${usage.tokensIn} tokensOut=${usage.tokensOut} costUsd=${usage.costUsd.toFixed(4)} toolCalls=${usage.toolCalls}`);

	const mistakes = summarizeMistakes(executions);
	const loop = detectLoop(executions);
	console.log(`Mistakes: errorRate=${mistakes.errorRate} loopDetected=${loop.loopDetected}`);

	console.log("\nReal live-LLM run captured and scored successfully.");
}

await main();
