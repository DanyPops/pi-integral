import { describe, expect, it } from "bun:test";
import { encodeRpcCommand, extractMessageText, parseRpcLine } from "../src/rpc-protocol.ts";

describe("encodeRpcCommand", () => {
	it("encodes a prompt command as one newline-terminated JSON line", () => {
		expect(encodeRpcCommand({ type: "prompt", message: "go" })).toBe('{"type":"prompt","message":"go"}\n');
	});

	it("encodes an abort command", () => {
		expect(encodeRpcCommand({ type: "abort" })).toBe('{"type":"abort"}\n');
	});

	it("encodes an extension_ui_response command with optional fields", () => {
		expect(encodeRpcCommand({ type: "extension_ui_response", id: "req-1", confirmed: true })).toBe(
			'{"type":"extension_ui_response","id":"req-1","confirmed":true}\n',
		);
	});
});

describe("parseRpcLine", () => {
	it("returns undefined for unparseable JSON", () => {
		expect(parseRpcLine("not json")).toBeUndefined();
	});

	it("returns undefined for valid JSON that is not a record", () => {
		expect(parseRpcLine("42")).toBeUndefined();
		expect(parseRpcLine("null")).toBeUndefined();
		expect(parseRpcLine('"a string"')).toBeUndefined();
	});

	it("returns undefined for a record with no string type", () => {
		expect(parseRpcLine('{"foo":"bar"}')).toBeUndefined();
	});

	it.each(["agent_start", "agent_end", "agent_settled"] as const)("parses a bare %s lifecycle event", (type) => {
		expect(parseRpcLine(JSON.stringify({ type }))).toEqual({ type });
	});

	it("parses response events", () => {
		expect(parseRpcLine(JSON.stringify({ type: "response", command: "prompt", success: true }))).toEqual({
			type: "response",
			command: "prompt",
			success: true,
		});
		expect(parseRpcLine(JSON.stringify({ type: "response", command: "prompt", success: false, error: "boom" }))).toEqual({
			type: "response",
			command: "prompt",
			success: false,
			error: "boom",
		});
	});

	it("degrades malformed known events to unknown-event", () => {
		const response = { type: "response", success: true };
		const message = { type: "message_start" };
		expect(parseRpcLine(JSON.stringify(response))).toEqual({ type: "unknown-event", raw: response });
		expect(parseRpcLine(JSON.stringify(message))).toEqual({ type: "unknown-event", raw: message });
	});

	it("parses message events", () => {
		const start = { type: "message_start", message: { role: "user", content: "hi" } };
		expect(parseRpcLine(JSON.stringify(start))).toEqual({
			type: "message_start",
			message: { role: "user", content: "hi" },
		});
		const update = {
			type: "message_update",
			assistantMessageEvent: { partial: { content: [{ type: "text", text: "hel" }] } },
		};
		expect(parseRpcLine(JSON.stringify(update))).toEqual({ type: "message_update", delta: { text: "hel" } });
		expect(parseRpcLine(JSON.stringify({ type: "message_update", assistantMessageEvent: {} }))).toEqual({
			type: "message_update",
			delta: undefined,
		});
	});

	it("parses tool execution events", () => {
		const start = { type: "tool_execution_start", toolCallId: "t1", toolName: "echo_tool", args: { message: "hi" } } as const;
		expect(parseRpcLine(JSON.stringify(start))).toEqual(start);
		const end = { type: "tool_execution_end", toolCallId: "t1", toolName: "echo_tool", result: { ok: true } } as const;
		expect(parseRpcLine(JSON.stringify(end))).toEqual({ ...end, isError: false });
	});

	it("parses extension UI requests", () => {
		const request = { type: "extension_ui_request", id: "req-1", method: "confirm", params: { message: "sure?" }, timeout: 5000 };
		expect(parseRpcLine(JSON.stringify(request))).toEqual({
			type: "extension_ui_request",
			request: { id: "req-1", method: "confirm", params: { message: "sure?" }, timeout: 5000 },
		});
	});

	it("preserves unrecognized valid events", () => {
		const invalidUi = { type: "extension_ui_request", id: "req-1", method: "not_a_real_method" };
		const future = { type: "compaction_start", detail: "whatever" };
		expect(parseRpcLine(JSON.stringify(invalidUi))).toEqual({ type: "unknown-event", raw: invalidUi });
		expect(parseRpcLine(JSON.stringify(future))).toEqual({ type: "unknown-event", raw: future });
	});
});

describe("extractMessageText", () => {
	it("returns string content", () => {
		expect(extractMessageText({ content: "hello" })).toBe("hello");
	});

	it("joins only text blocks", () => {
		expect(
			extractMessageText({
				content: [
					{ type: "text", text: "a" },
					{ type: "thinking", text: "ignored" },
					{ type: "text", text: "b" },
				],
			}),
		).toBe("ab");
	});

	it("returns empty text for unsupported values", () => {
		expect(extractMessageText(null)).toBe("");
		expect(extractMessageText(42)).toBe("");
		expect(extractMessageText({ content: 42 })).toBe("");
	});
});
