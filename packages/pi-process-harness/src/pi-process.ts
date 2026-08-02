/**
 * Spawns a real `pi --mode rpc` process -- a real AgentSession, real agent
 * loop, real tool execution -- for integration tests that need more than
 * `@danypops/pi-extension-harness`'s in-process/jiti/mock-cli layers can
 * give: something that genuinely *decides* to call a tool from a prompt,
 * not a test hand-feeding a tool name directly.
 */
import { type ChildProcessByStdio, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Readable, Writable } from "node:stream";
import { StringDecoder } from "node:string_decoder";
import { encodeRpcCommand, type PiRpcCommand, type PiRpcEvent, parseRpcLine } from "./rpc-protocol.js";

const MAX_STDERR_CHARS = 8_000;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 2_000;

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
	onEvent(listener: (event: PiRpcEvent) => void): () => void;
	onExit(listener: (code: number | null) => void): () => void;
	waitForExit(): Promise<number | null>;
	dispose(): void;
}

/** Waits until `predicate` is true of some already-seen event, or times out. Polls rather than requiring a caller-supplied resolver per event type. */
export function waitForRpcEvent(
	events: readonly PiRpcEvent[],
	predicate: (event: PiRpcEvent) => boolean,
	options: { timeoutMs?: number; pollIntervalMs?: number } = {},
): Promise<PiRpcEvent> {
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
	const baseEnv: Record<string, string | undefined> = { ...process.env };
	if (options.isolatedHome !== false) {
		homeDir = options.isolatedHome ?? mkdtempSync(join(tmpdir(), "pi-process-harness-home-"));
		if (options.isolatedHome === undefined) ownedHomeDir = homeDir;
		baseEnv["HOME"] = homeDir;
		baseEnv["PI_CODING_AGENT_DIR"] = join(homeDir, ".pi", "agent");
	}

	const child: ChildProcessByStdio<Writable, Readable, Readable> = spawn(bin, args, {
		cwd: options.cwd,
		env: { ...baseEnv, ...options.env },
		stdio: ["pipe", "pipe", "pipe"],
	});

	const eventListeners = new Set<(event: PiRpcEvent) => void>();
	const exitListeners = new Set<(code: number | null) => void>();
	let stderr = "";
	let exitPromiseResolve: ((code: number | null) => void) | undefined;
	const exitPromise = new Promise<number | null>((resolve) => {
		exitPromiseResolve = resolve;
	});

	const decoder = new StringDecoder("utf8");
	let buffer = "";
	child.stdout.on("data", (chunk: Buffer) => {
		buffer += decoder.write(chunk);
		for (let index = buffer.indexOf("\n"); index !== -1; index = buffer.indexOf("\n")) {
			let line = buffer.slice(0, index);
			buffer = buffer.slice(index + 1);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			if (!line) continue;
			const event = parseRpcLine(line);
			if (event) for (const listener of eventListeners) listener(event);
		}
	});

	child.stderr.on("data", (chunk: Buffer) => {
		stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_CHARS);
	});

	child.on("exit", (code) => {
		for (const listener of exitListeners) listener(code);
		exitPromiseResolve?.(code);
	});

	function send(rpcCommand: PiRpcCommand): void {
		if (child.exitCode !== null) return;
		child.stdin.write(encodeRpcCommand(rpcCommand));
	}

	return {
		get pid() {
			return child.pid;
		},
		homeDir,
		sendPrompt(message) {
			send({ type: "prompt", message });
		},
		abort() {
			send({ type: "abort" });
		},
		get stderr() {
			return stderr;
		},
		get exitCode() {
			return child.exitCode;
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
			return exitPromise;
		},
		dispose() {
			eventListeners.clear();
			const cleanupHomeDir = (): void => {
				if (ownedHomeDir) rmSync(ownedHomeDir, { recursive: true, force: true });
			};
			if (child.exitCode !== null) {
				cleanupHomeDir();
				return;
			}
			child.kill("SIGTERM");
			const timer = setTimeout(() => {
				if (child.exitCode === null) child.kill("SIGKILL");
			}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
			timer.unref();
			child.once("exit", () => {
				clearTimeout(timer);
				cleanupHomeDir();
			});
		},
	};
}
