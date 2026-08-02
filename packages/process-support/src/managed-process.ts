import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable, Writable } from "node:stream";

const MAX_STDERR_CHARS = 8_000;
const DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS = 2_000;

export interface SpawnManagedProcessOptions {
	readonly command: string;
	readonly args?: readonly string[];
	readonly cwd?: string;
	/** Merged over the ambient process.env. */
	readonly env?: Record<string, string | undefined>;
	/** SIGTERM, then SIGKILL after this many ms if the process hasn't exited. Defaults to 2000. */
	readonly gracefulShutdownTimeoutMs?: number;
}

export interface ManagedProcess {
	readonly pid: number | undefined;
	/** The most recent MAX_STDERR_CHARS of stderr output -- bounded so a runaway writer can't grow this unboundedly. */
	readonly stderr: string;
	/**
	 * Null both while still running AND when terminated by a signal (matches Node's own
	 * subprocess.exitCode semantics exactly) -- check hasExited for "is it actually dead", and
	 * signalCode for "was it killed by a signal" rather than inferring either from this alone.
	 */
	readonly exitCode: number | null;
	/** The signal that terminated the process, if any -- null both while running and for a real (non-signal) exit. */
	readonly signalCode: NodeJS.Signals | null;
	/** True once the process has genuinely exited, regardless of whether that was a real exit code or a signal. */
	readonly hasExited: boolean;
	/** Writes to the child's stdin. A silent no-op once the process has already exited -- never throws on a late write. */
	write(data: string): void;
	/** Subscribes to raw stdout chunks as they arrive. Returns an unsubscribe function. */
	onStdout(listener: (chunk: Buffer) => void): () => void;
	waitForExit(): Promise<number | null>;
	/** SIGTERM, then SIGKILL after gracefulShutdownTimeoutMs; resolves once the process has actually exited. A no-op that resolves immediately if it already had. */
	dispose(): Promise<void>;
}

/**
 * Spawns a real child process with the two concerns every one of this package's callers
 * (pi-process-harness's spawnRealPiProcess, spawnCompanionDaemon) previously duplicated
 * independently: bounded stderr capture, and graceful-then-forceful shutdown. Stdout is exposed
 * raw via onStdout -- NDJSON/line-buffered parsing (see line-splitter.ts) and readiness polling
 * are each caller's own higher-level concern, not this primitive's.
 */
export function spawnManagedProcess(options: SpawnManagedProcessOptions): ManagedProcess {
	const child: ChildProcessByStdio<Writable, Readable, Readable> = spawn(options.command, [...(options.args ?? [])], {
		cwd: options.cwd,
		env: options.env ? { ...process.env, ...options.env } : process.env,
		stdio: ["pipe", "pipe", "pipe"],
	});

	const gracefulShutdownTimeoutMs = options.gracefulShutdownTimeoutMs ?? DEFAULT_GRACEFUL_SHUTDOWN_TIMEOUT_MS;
	const stdoutListeners = new Set<(chunk: Buffer) => void>();
	let stderr = "";

	child.stdout.on("data", (chunk: Buffer) => {
		for (const listener of stdoutListeners) listener(chunk);
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_CHARS);
	});

	// Tracked independently of child.exitCode/child.signalCode rather than reading them
	// directly: under Bun's node:child_process shim, they are not always updated synchronously
	// with the 'exit' event firing -- confirmed live (dispose()'s own tests read them as still
	// null immediately after the awaited exitPromise resolved). hasExited is tracked separately
	// from exitCode because a signal-killed process legitimately has a null exitCode forever --
	// conflating the two would make write()'s no-op guard below wrongly treat a signal-killed
	// process as still alive.
	let observedExitCode: number | null = null;
	let observedSignalCode: NodeJS.Signals | null = null;
	let hasExited = false;
	let exitPromiseResolve: ((code: number | null) => void) | undefined;
	const exitPromise = new Promise<number | null>((resolvePromise) => {
		exitPromiseResolve = resolvePromise;
	});
	child.on("exit", (code, signal) => {
		observedExitCode = code;
		observedSignalCode = signal;
		hasExited = true;
		exitPromiseResolve?.(code);
	});

	return {
		get pid() {
			return child.pid;
		},
		get stderr() {
			return stderr;
		},
		get exitCode() {
			return observedExitCode;
		},
		get signalCode() {
			return observedSignalCode;
		},
		get hasExited() {
			return hasExited;
		},
		write(data: string): void {
			if (hasExited) return;
			child.stdin.write(data);
		},
		onStdout(listener) {
			stdoutListeners.add(listener);
			return () => stdoutListeners.delete(listener);
		},
		waitForExit() {
			return exitPromise;
		},
		async dispose() {
			if (hasExited) return;
			child.kill("SIGTERM");
			const timer = setTimeout(() => {
				if (!hasExited) child.kill("SIGKILL");
			}, gracefulShutdownTimeoutMs);
			timer.unref();
			await exitPromise;
			clearTimeout(timer);
		},
	};
}
