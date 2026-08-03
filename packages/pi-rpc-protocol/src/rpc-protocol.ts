export interface PiPromptCommand {
	readonly type: "prompt";
	readonly message: string;
}

export interface PiAbortCommand {
	readonly type: "abort";
}

export interface PiExtensionUiResponseCommand {
	readonly type: "extension_ui_response";
	readonly id: string;
	readonly value?: string;
	readonly confirmed?: boolean;
	readonly cancelled?: boolean;
}

export type PiRpcCommand = PiPromptCommand | PiAbortCommand | PiExtensionUiResponseCommand;

export function encodeRpcCommand(command: PiRpcCommand): string {
	return `${JSON.stringify(command)}\n`;
}

export interface PiRpcMessage {
	readonly role: string;
	readonly content: unknown;
}

export interface PiExtensionUiRequest {
	readonly id: string;
	readonly method: "select" | "confirm" | "input" | "editor" | "notify" | "setStatus" | "setWidget" | "setTitle";
	readonly params: unknown;
	readonly timeout?: number;
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
	| { readonly type: "extension_ui_request"; readonly request: PiExtensionUiRequest }
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

const EXTENSION_UI_METHODS = new Set(["select", "confirm", "input", "editor", "notify", "setStatus", "setWidget", "setTitle"]);

function parseExtensionUiRequest(value: JsonRecord): PiRpcEvent | undefined {
	const id = getString(value, "id");
	const method = getString(value, "method");
	if (id === undefined || method === undefined || !EXTENSION_UI_METHODS.has(method)) return undefined;
	const timeout = value["timeout"];
	const request: PiExtensionUiRequest =
		typeof timeout === "number"
			? { id, method: method as PiExtensionUiRequest["method"], params: value["params"], timeout }
			: { id, method: method as PiExtensionUiRequest["method"], params: value["params"] };
	return { type: "extension_ui_request", request };
}

/** Parses one JSONL line into a typed event. Malformed JSON is ignored; unknown valid events are preserved. */
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
		case "extension_ui_request":
			return parseExtensionUiRequest(value) ?? { type: "unknown-event", raw: value };
		default:
			return { type: "unknown-event", raw: value };
	}
}
