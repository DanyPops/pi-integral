/**
 * Encodes/decodes Pi's own documented `pi --mode rpc` wire protocol
 * (docs/rpc.md in pi-mono): one JSON command per stdin line, one JSON
 * `AgentSessionEvent` per stdout line.
 *
 * This used to be a hand-rolled, narrower reimplementation (manually
 * reconstructing each event's fields from raw JSON, covering only a
 * fraction of the real event union) -- a real duplication of
 * `@earendil-works/pi-coding-agent`'s own first-party `RpcClient`, which
 * is published and exported from that package's main entry point.
 * Reading RpcClient's own source settled the actual question this file
 * used to guess at: it parses incoming lines with a plain `JSON.parse`
 * and casts the result directly to `AgentSessionEvent`, no manual field
 * reconstruction at all -- the wire format already matches the real
 * TypeScript types exactly. This file now does the same, and uses the
 * real `RpcCommand`/`AgentSessionEvent` types directly instead of a
 * narrower hand-rolled subset.
 *
 * `pi-process.ts` doesn't use `RpcClient` itself, though: RpcClient
 * exposes no public pid/exitCode/exit-event/bounded-stderr surface at all
 * (its own child process is a private field), which this harness's tests
 * genuinely rely on. Its own spawn/shutdown layer (`./managed-process.ts`)
 * stays -- only the wire-format encode/decode was actually duplicated.
 */
import type { AgentSessionEvent, RpcCommand } from "@earendil-works/pi-coding-agent";

export function encodeRpcCommand(command: RpcCommand): string {
	return `${JSON.stringify(command)}\n`;
}

/** Parses one JSONL line from Pi's RPC stdout into a real AgentSessionEvent; returns undefined for a malformed or non-JSON line rather than throwing. */
export function parseRpcLine(line: string): AgentSessionEvent | undefined {
	try {
		return JSON.parse(line) as AgentSessionEvent;
	} catch {
		return undefined;
	}
}

/** Extracts plain text from an AgentMessage's content blocks -- a small convenience for readable test assertions, not itself part of the wire protocol. */
export function extractMessageText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter((block): block is { type: string; text: string } => isTextBlock(block))
		.map((block) => block.text)
		.join("");
}

function isTextBlock(value: unknown): value is { type: string; text: string } {
	return (
		typeof value === "object" &&
		value !== null &&
		(value as Record<string, unknown>)["type"] === "text" &&
		typeof (value as Record<string, unknown>)["text"] === "string"
	);
}
