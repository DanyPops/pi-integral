const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_MAX_OUTPUT_BYTES = 1_048_576;

export interface RunCliToCompletionOptions {
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly stdin?: Blob;
	/** Retries empty output and pipe-read failures. Defaults to 3. */
	readonly maxAttempts?: number;
	/** Maximum bytes collected from each output stream. Defaults to 1 MiB. */
	readonly maxOutputBytes?: number;
}

export interface CliCompletion {
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly attempts: number;
}

export class CliOutputLimitError extends Error {
	constructor(
		readonly stream: "stdout" | "stderr",
		readonly maxOutputBytes: number,
	) {
		super(`${stream} exceeded the ${maxOutputBytes}-byte output limit`);
		this.name = "CliOutputLimitError";
	}
}

async function readBounded(stream: ReadableStream<Uint8Array>, streamName: "stdout" | "stderr", maxOutputBytes: number): Promise<string> {
	const reader = stream.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	for (;;) {
		const result = await reader.read();
		if (result.done) break;
		byteLength += result.value.byteLength;
		if (byteLength > maxOutputBytes) {
			await reader.cancel();
			throw new CliOutputLimitError(streamName, maxOutputBytes);
		}
		chunks.push(result.value);
	}
	const output = new Uint8Array(byteLength);
	let offset = 0;
	for (const chunk of chunks) {
		output.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return new TextDecoder().decode(output);
}

/**
 * Runs a short Bun-native CLI process to completion. This is separate from
 * spawnManagedProcess because retrying a completed invocation requires a fresh process.
 */
export async function runCliToCompletion(
	command: string,
	args: readonly string[] = [],
	options: RunCliToCompletionOptions = {},
): Promise<CliCompletion> {
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
	if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new RangeError("maxAttempts must be a positive integer");
	if (!Number.isInteger(maxOutputBytes) || maxOutputBytes < 1) throw new RangeError("maxOutputBytes must be a positive integer");

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		const process = Bun.spawn([command, ...args], {
			...(options.cwd === undefined ? {} : { cwd: options.cwd }),
			...(options.env === undefined ? {} : { env: options.env }),
			...(options.stdin === undefined ? {} : { stdin: options.stdin }),
			stdout: "pipe",
			stderr: "pipe",
		});
		try {
			const [stdout, stderr, code] = await Promise.all([
				readBounded(process.stdout, "stdout", maxOutputBytes),
				readBounded(process.stderr, "stderr", maxOutputBytes),
				process.exited,
			]);
			if (stdout.length > 0 || stderr.length > 0 || attempt === maxAttempts) return { code, stdout, stderr, attempts: attempt };
		} catch (error) {
			process.kill();
			await process.exited.catch(() => undefined);
			if (error instanceof CliOutputLimitError || attempt === maxAttempts) throw error;
		}
	}
	throw new Error("unreachable");
}
