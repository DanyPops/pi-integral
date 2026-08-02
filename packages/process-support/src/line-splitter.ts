import { StringDecoder } from "node:string_decoder";

/**
 * Buffers arbitrary chunks (which may split a line, or even a multi-byte UTF-8 character, at any
 * byte boundary) and emits one call to `onLine` per complete, non-blank line -- CRLF and LF both
 * normalize to no trailing terminator. A trailing partial line with no newline yet is held until
 * a later chunk completes it, never emitted early.
 *
 * Returns the feed function to call with each raw chunk as it arrives.
 */
export function createLineSplitter(onLine: (line: string) => void): (chunk: Buffer) => void {
	const decoder = new StringDecoder("utf8");
	let buffer = "";
	return (chunk: Buffer): void => {
		buffer += decoder.write(chunk);
		for (let index = buffer.indexOf("\n"); index !== -1; index = buffer.indexOf("\n")) {
			let line = buffer.slice(0, index);
			buffer = buffer.slice(index + 1);
			if (line.endsWith("\r")) line = line.slice(0, -1);
			if (line) onLine(line);
		}
	};
}
