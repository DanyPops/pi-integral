/**
 * Spawns and tears down a companion daemon process alongside a real Pi
 * process under test (e.g. Epi, or any other Vehicle-backed daemon) --
 * generic, no Pi-specific or Vehicle-specific knowledge. Readiness is the
 * caller's own concern (poll a health endpoint, a handle file, a port),
 * this module only owns the poll loop on top of ./managed-process.ts's
 * shared spawn/stderr/shutdown primitive.
 */
import { type ManagedProcess, spawnManagedProcess } from "./managed-process.js";

const DEFAULT_READY_TIMEOUT_MS = 10_000;
const DEFAULT_POLL_INTERVAL_MS = 100;

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

function asCompanionDaemon(process: ManagedProcess): CompanionDaemon {
	return {
		get pid() {
			return process.pid;
		},
		get stderr() {
			return process.stderr;
		},
		get exitCode() {
			return process.exitCode;
		},
		waitForExit: () => process.waitForExit(),
		dispose: () => process.dispose(),
	};
}

export async function spawnCompanionDaemon(options: SpawnCompanionDaemonOptions): Promise<CompanionDaemon> {
	const process = spawnManagedProcess({
		command: options.command,
		...(options.args !== undefined && { args: options.args }),
		...(options.cwd !== undefined && { cwd: options.cwd }),
		...(options.env !== undefined && { env: options.env }),
	});

	try {
		await pollUntilReady(
			options.isReady,
			options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
			options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
		);
	} catch (error) {
		if (!process.hasExited) await process.dispose();
		throw error;
	}

	return asCompanionDaemon(process);
}
