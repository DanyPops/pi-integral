import { describe, expect, it } from "bun:test";
import { createLineSplitter } from "../src/line-splitter.ts";

describe("createLineSplitter", () => {
	it("emits one line per newline-terminated chunk", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		feed(Buffer.from("hello\nworld\n"));
		expect(lines).toEqual(["hello", "world"]);
	});

	it("buffers a partial line across chunks until the newline arrives", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		feed(Buffer.from("hel"));
		feed(Buffer.from("lo\n"));
		expect(lines).toEqual(["hello"]);
	});

	it("never emits a trailing partial line with no newline yet", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		feed(Buffer.from("no newline here"));
		expect(lines).toEqual([]);
	});

	it("strips a trailing carriage return (CRLF line endings)", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		feed(Buffer.from("hello\r\nworld\r\n"));
		expect(lines).toEqual(["hello", "world"]);
	});

	it("skips blank lines", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		feed(Buffer.from("a\n\nb\n"));
		expect(lines).toEqual(["a", "b"]);
	});

	it("handles a multi-byte UTF-8 character split exactly at a chunk boundary", () => {
		const lines: string[] = [];
		const feed = createLineSplitter((line) => lines.push(line));
		const encoded = Buffer.from("emoji: 🎉\n", "utf-8");
		// Split in the middle of the 4-byte emoji's UTF-8 encoding.
		const splitPoint = encoded.indexOf(0xf0) + 2;
		feed(encoded.subarray(0, splitPoint));
		feed(encoded.subarray(splitPoint));
		expect(lines).toEqual(["emoji: 🎉"]);
	});
});
