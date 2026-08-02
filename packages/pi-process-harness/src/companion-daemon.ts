/**
 * Spawns and tears down a companion daemon process alongside a real Pi
 * process under test (e.g. Epi, or any other Vehicle-backed daemon) --
 * generic, no Pi-specific or Vehicle-specific knowledge. Readiness is the
 * caller's own concern (poll a health endpoint, a handle file, a port),
 * this module only owns the poll loop and the spawn/shutdown mechanics.
 */
import { type ChildProcessByStdio, spawn } from "node:child_process";
import type { Readable } from "node:stream";

const MAX_STDERR_CHARS = 8_000;
const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 100;
const GRACEFUL_SHUTDOWN_TIMEOUT_MS = 2_000;

export interface SpawnCompanionDaemonOptions {
	readonly command: string;
	readonly args?: readonly string[];
	readonly cwd?: string;
	readonly env?: Record<string, string>;
	/** Polled until it returns true, or readyTimeoutMs elapses. */
	readonly isReady: () => boolean | Promise<boolean>;
	readonly readyTimeoutMs?: number;
	readonly pollIntervalMs?: number;
}

export interface CompanionDaemon {
	readonly pid: number | undefined;
	readonly stderr: string;
	readonly exitCode: number | null;
	waitForExit(): Promise<number | null>;
	/** SIGTERM, then SIGKILL after a grace period; resolves once the process has actually exited. */
	dispose(): Promise<void>;
}

export class CompanionDaemonReadyTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Companion daemon did not become ready within ${timeoutMs}ms`);
		this.name = "CompanionDaemonReadyTimeoutError";
	}
}

async function pollUntilReady(isReady: () => boolean | Promise<boolean>, timeoutMs: number, pollIntervalMs: number): Promise<void> {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		if (await isReady()) return;
		if (Date.now() >= deadline) throw new CompanionDaemonReadyTimeoutError(timeoutMs);
		await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
	}
}

export async function spawnCompanionDaemon(options: SpawnCompanionDaemonOptions): Promise<CompanionDaemon> {
	const child: ChildProcessByStdio<null, Readable, Readable> = spawn(options.command, [...(options.args ?? [])], {
		cwd: options.cwd,
		env: options.env ? { ...process.env, ...options.env } : process.env,
		stdio: ["ignore", "pipe", "pipe"],
	});

	let stderr = "";
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = (stderr + chunk.toString("utf8")).slice(-MAX_STDERR_CHARS);
	});

	let exitPromiseResolve: ((code: number | null) => void) | undefined;
	const exitPromise = new Promise<number | null>((resolve) => {
		exitPromiseResolve = resolve;
	});
	child.on("exit", (code) => exitPromiseResolve?.(code));

	try {
		await pollUntilReady(
			options.isReady,
			options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
			options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
		);
	} catch (error) {
		if (child.exitCode === null) child.kill("SIGKILL");
		throw error;
	}

	return {
		get pid() {
			return child.pid;
		},
		get stderr() {
			return stderr;
		},
		get exitCode() {
			return child.exitCode;
		},
		waitForExit() {
			return exitPromise;
		},
		async dispose() {
			if (child.exitCode !== null) return;
			child.kill("SIGTERM");
			const timer = setTimeout(() => {
				if (child.exitCode === null) child.kill("SIGKILL");
			}, GRACEFUL_SHUTDOWN_TIMEOUT_MS);
			timer.unref();
			await exitPromise;
			clearTimeout(timer);
		},
	};
}
