/**
 * Spawns a real `pi --mode rpc` process -- a real AgentSession, real agent
 * loop, real tool execution -- for integration tests that need more than
 * `@danypops/pi-extension-harness`'s in-process/jiti/mock-cli layers can
 * give: something that genuinely *decides* to call a tool from a prompt,
 * not a test hand-feeding a tool name directly.
 *
 * Does not wrap `@earendil-works/pi-coding-agent`'s own published
 * `RpcClient` wholesale: RpcClient owns its child process as a private
 * field with no public pid, exitCode, exit event, or bounded-stderr
 * surface at all, which this harness's own tests genuinely need (see
 * isolation.test.ts). What WAS real duplication -- the JSONL wire-protocol
 * encode/decode -- now lives in `rpc-protocol.ts` using RpcClient's own
 * real `RpcCommand`/`AgentSessionEvent` types instead of a narrower
 * hand-rolled reimplementation of them.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentSessionEvent, RpcCommand } from "@earendil-works/pi-coding-agent";
import { createLineSplitter } from "./line-splitter.js";
import { spawnManagedProcess } from "./managed-process.js";
import { encodeRpcCommand, parseRpcLine } from "./rpc-protocol.js";

export interface SpawnPiProcessOptions {
	/** Defaults to "pi" on PATH. Override for a pinned binary or a fixture stand-in. */
	readonly bin?: string;
	/** Paths passed as repeated `--extension <path>` flags, in order. */
	readonly extensions?: readonly string[];
	/** e.g. ["--provider", "faux", "--model", "faux-1"] -- appended verbatim after the extension flags. */
	readonly extraArgs?: readonly string[];
	readonly cwd?: string;
	/** Merged over the isolated (or ambient, if isolatedHome is false) base env. */
	readonly env?: Record<string, string>;
	/**
	 * Isolates the spawned process's `PI_CODING_AGENT_DIR`/`HOME` so it never
	 * loads the real operator's own settings, extensions, or credentials --
	 * confirmed live to matter: without this, a spawned process silently
	 * ignored `--provider`/`--model` overrides, loaded the real ~/.pi/agent
	 * profile's extensions, and made a real paid LLM call instead of using a
	 * scripted faux provider. Defaults to a fresh temp directory per spawn,
	 * removed on dispose(). Pass an explicit path to reuse/inspect a specific
	 * directory (not removed on dispose -- the caller owns it then). Pass
	 * `false` to use the real ambient environment -- almost never correct for
	 * a test; requires deliberately opting out.
	 */
	readonly isolatedHome?: string | false;
}

export interface RealPiProcess {
	readonly pid: number | undefined;
	/** The isolated home directory this process was given, when isolation is active (default). Undefined when `isolatedHome: false`. */
	readonly homeDir: string | undefined;
	sendPrompt(message: string): void;
	abort(): void;
	readonly stderr: string;
	readonly exitCode: number | null;
	onEvent(listener: (event: AgentSessionEvent) => void): () => void;
	onExit(listener: (code: number | null) => void): () => void;
	waitForExit(): Promise<number | null>;
	/** Stops the real Pi process and removes any harness-owned isolated home before resolving. Idempotent. */
	dispose(): Promise<void>;
}

/** Waits until `predicate` is true of some already-seen event, or times out. Polls rather than requiring a caller-supplied resolver per event type. */
export function waitForRpcEvent(
	events: readonly AgentSessionEvent[],
	predicate: (event: AgentSessionEvent) => boolean,
	options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<AgentSessionEvent> {
	const timeoutMs = options.timeoutMs ?? 10_000;
	const pollIntervalMs = options.pollIntervalMs ?? 10;
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const timer = setInterval(() => {
			const found = events.find(predicate);
			if (found) {
				clearInterval(timer);
				resolve(found);
			} else if (Date.now() - start > timeoutMs) {
				clearInterval(timer);
				reject(new Error(`waitForRpcEvent: timed out after ${timeoutMs}ms`));
			}
		}, pollIntervalMs);
	});
}

export function spawnRealPiProcess(options: SpawnPiProcessOptions = {}): RealPiProcess {
	const bin = options.bin ?? "pi";
	const args: string[] = ["--mode", "rpc", "--no-session"];
	for (const extension of options.extensions ?? []) args.push("--extension", extension);
	args.push(...(options.extraArgs ?? []));

	let ownedHomeDir: string | undefined;
	let homeDir: string | undefined;
	const isolationEnv: Record<string, string> = {};
	if (options.isolatedHome !== false) {
		homeDir = options.isolatedHome ?? mkdtempSync(join(tmpdir(), "pi-process-harness-home-"));
		if (options.isolatedHome === undefined) ownedHomeDir = homeDir;
		isolationEnv["HOME"] = homeDir;
		isolationEnv["PI_CODING_AGENT_DIR"] = join(homeDir, ".pi", "agent");
	}

	const process = spawnManagedProcess({
		command: bin,
		args,
		...(options.cwd !== undefined && { cwd: options.cwd }),
		env: { ...isolationEnv, ...options.env },
	});

	const eventListeners = new Set<(event: AgentSessionEvent) => void>();
	const exitListeners = new Set<(code: number | null) => void>();

	const lineSplitter = createLineSplitter((line) => {
		const event = parseRpcLine(line);
		if (event) for (const listener of eventListeners) listener(event);
	});
	process.onStdout((chunk) => lineSplitter.feed(chunk));
	void process.waitForExit().then((code) => {
		// A process's very last stdout write may not end in "\n" -- flush whatever line-splitter
		// still has buffered so it isn't silently lost once the stream truly ends.
		lineSplitter.flush();
		for (const listener of exitListeners) listener(code);
	});

	function send(rpcCommand: RpcCommand): void {
		process.write(encodeRpcCommand(rpcCommand));
	}

	return {
		get pid() {
			return process.pid;
		},
		homeDir,
		sendPrompt(message) {
			send({ type: "prompt", message });
		},
		abort() {
			send({ type: "abort" });
		},
		get stderr() {
			return process.stderr;
		},
		get exitCode() {
			return process.exitCode;
		},
		onEvent(listener) {
			eventListeners.add(listener);
			return () => eventListeners.delete(listener);
		},
		onExit(listener) {
			exitListeners.add(listener);
			return () => exitListeners.delete(listener);
		},
		waitForExit() {
			return process.waitForExit();
		},
		async dispose() {
			eventListeners.clear();
			await process.dispose();
			if (ownedHomeDir) rmSync(ownedHomeDir, { recursive: true, force: true });
		},
	};
}
