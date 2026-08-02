import { describe, expect, it } from "bun:test";
import { createLineSplitter } from "../src/line-splitter.ts";

describe("createLineSplitter", () => {
	it("emits one line per newline-terminated chunk", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("hello\nworld\n"));
		expect(lines).toEqual(["hello", "world"]);
	});

	it("buffers a partial line across chunks until the newline arrives", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("hel"));
		splitter.feed(Buffer.from("lo\n"));
		expect(lines).toEqual(["hello"]);
	});

	it("never emits a trailing partial line with no newline yet, unless flushed", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("no newline here"));
		expect(lines).toEqual([]);
	});

	it("strips a trailing carriage return (CRLF line endings)", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("hello\r\nworld\r\n"));
		expect(lines).toEqual(["hello", "world"]);
	});

	it("skips blank lines", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("a\n\nb\n"));
		expect(lines).toEqual(["a", "b"]);
	});

	it("handles a multi-byte UTF-8 character split exactly at a chunk boundary", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		const encoded = Buffer.from("emoji: 🎉\n", "utf-8");
		// Split in the middle of the 4-byte emoji's UTF-8 encoding.
		const splitPoint = encoded.indexOf(0xf0) + 2;
		splitter.feed(encoded.subarray(0, splitPoint));
		splitter.feed(encoded.subarray(splitPoint));
		expect(lines).toEqual(["emoji: 🎉"]);
	});

	it("flush() emits a buffered final line that never got a trailing newline -- otherwise lost forever", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("first\nlast line, no newline"));
		expect(lines).toEqual(["first"]);
		splitter.flush();
		expect(lines).toEqual(["first", "last line, no newline"]);
	});

	it("flush() with nothing buffered is a silent no-op", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		splitter.feed(Buffer.from("complete\n"));
		splitter.flush();
		expect(lines).toEqual(["complete"]);
	});

	it("flush() correctly decodes a multi-byte UTF-8 character left pending in the decoder", () => {
		const lines: string[] = [];
		const splitter = createLineSplitter((line) => lines.push(line));
		const encoded = Buffer.from("no newline: 🎉", "utf-8");
		const splitPoint = encoded.indexOf(0xf0) + 2;
		splitter.feed(encoded.subarray(0, splitPoint));
		splitter.feed(encoded.subarray(splitPoint));
		splitter.flush();
		expect(lines).toEqual(["no newline: 🎉"]);
	});
});
