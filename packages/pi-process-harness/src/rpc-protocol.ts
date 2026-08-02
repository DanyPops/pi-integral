/**
 * The subset of Pi's documented RPC protocol (docs/rpc.md in pi-mono) this
 * harness observes: sending a prompt, and parsing the event types needed to
 * assert on a real agent turn (tool calls, message text, run lifecycle).
 * Every other real event type parses into `unknown-event` rather than being
 * dropped or throwing.
 *
 * This is the third independent copy of this exact parser in this
 * ecosystem (Alignment's `process-rpc-session.ts`, Epi's `rpc-protocol.ts`,
 * now this) -- a real, mechanically-confirmed signal that the JSONL RPC
 * framing/parsing itself (not the daemon or session-pool logic built on
 * top of it) is a genuine extraction candidate for a small shared package.
 * Not done here to keep this package's own scope narrow; flagged for a
 * follow-up rather than silently accepted as permanent duplication.
 */

export interface PiPromptCommand {
	readonly type: "prompt";
	readonly message: string;
}

export interface PiAbortCommand {
	readonly type: "abort";
}

export type PiRpcCommand = PiPromptCommand | PiAbortCommand;

export function encodeRpcCommand(command: PiRpcCommand): string {
	return `${JSON.stringify(command)}\n`;
}

export interface PiRpcMessage {
	readonly role: string;
	readonly content: unknown;
}

export type PiRpcEvent =
	| { readonly type: "response"; readonly command: string; readonly success: boolean; readonly error?: string }
	| { readonly type: "agent_start" }
	| { readonly type: "agent_end" }
	| { readonly type: "agent_settled" }
	| { readonly type: "message_start"; readonly message: PiRpcMessage }
	| { readonly type: "message_end"; readonly message: PiRpcMessage }
	| { readonly type: "message_update"; readonly delta: PiTextDelta | undefined }
	| { readonly type: "tool_execution_start"; readonly toolCallId: string; readonly toolName: string; readonly args: unknown }
	| {
			readonly type: "tool_execution_end";
			readonly toolCallId: string;
			readonly toolName: string;
			readonly result: unknown;
			readonly isError: boolean;
	  }
	| { readonly type: "unknown-event"; readonly raw: unknown };

export interface PiTextDelta {
	readonly text: string;
}

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
	return typeof value === "object" && value !== null;
}

function getString(record: JsonRecord, key: string): string | undefined {
	const value = record[key];
	return typeof value === "string" ? value : undefined;
}

function parseMessage(value: unknown): PiRpcMessage | undefined {
	if (!isRecord(value)) return undefined;
	const role = getString(value, "role");
	if (role === undefined) return undefined;
	return { role, content: value["content"] };
}

function parseTextDelta(assistantMessageEvent: unknown): PiTextDelta | undefined {
	if (!isRecord(assistantMessageEvent)) return undefined;
	const partial = assistantMessageEvent["partial"];
	if (!isRecord(partial)) return undefined;
	return { text: extractMessageText(partial) };
}

export function extractMessageText(message: unknown): string {
	if (!isRecord(message)) return "";
	const content = message["content"];
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.filter(
			(block): block is { type: string; text: string } => isRecord(block) && block["type"] === "text" && typeof block["text"] === "string",
		)
		.map((block) => block.text)
		.join("");
}

function parseToolExecutionStart(value: JsonRecord): PiRpcEvent | undefined {
	const toolCallId = getString(value, "toolCallId");
	const toolName = getString(value, "toolName");
	if (toolCallId === undefined || toolName === undefined) return undefined;
	return { type: "tool_execution_start", toolCallId, toolName, args: value["args"] };
}

function parseToolExecutionEnd(value: JsonRecord): PiRpcEvent | undefined {
	const toolCallId = getString(value, "toolCallId");
	const toolName = getString(value, "toolName");
	if (toolCallId === undefined || toolName === undefined) return undefined;
	return { type: "tool_execution_end", toolCallId, toolName, result: value["result"], isError: value["isError"] === true };
}

function parseResponse(value: JsonRecord): PiRpcEvent | undefined {
	const command = getString(value, "command");
	const success = value["success"];
	if (command === undefined || typeof success !== "boolean") return undefined;
	const error = getString(value, "error");
	return error === undefined ? { type: "response", command, success } : { type: "response", command, success, error };
}

/** Parses one JSONL line from Pi's RPC stdout into a typed event; never throws. */
export function parseRpcLine(line: string): PiRpcEvent | undefined {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return undefined;
	}
	if (!isRecord(value)) return undefined;
	const type = value["type"];
	if (typeof type !== "string") return undefined;

	switch (type) {
		case "agent_start":
		case "agent_end":
		case "agent_settled":
			return { type };
		case "response":
			return parseResponse(value) ?? { type: "unknown-event", raw: value };
		case "message_start":
		case "message_end": {
			const message = parseMessage(value["message"]);
			return message ? { type, message } : { type: "unknown-event", raw: value };
		}
		case "message_update":
			return { type: "message_update", delta: parseTextDelta(value["assistantMessageEvent"]) };
		case "tool_execution_start":
			return parseToolExecutionStart(value) ?? { type: "unknown-event", raw: value };
		case "tool_execution_end":
			return parseToolExecutionEnd(value) ?? { type: "unknown-event", raw: value };
		default:
			return { type: "unknown-event", raw: value };
	}
}
