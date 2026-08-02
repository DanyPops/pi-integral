import { StringDecoder } from "node:string_decoder";

export interface LineSplitter {
	/** Feed one raw chunk (which may split a line, or even a multi-byte UTF-8 character, at any byte boundary). */
	feed(chunk: Buffer): void;
	/**
	 * Emits any still-buffered partial line as a final line, even without a
	 * trailing newline -- call once the underlying stream has genuinely
	 * ended (e.g. the process exited). Without this, a process whose very
	 * last write doesn't end in "\n" loses that line silently forever.
	 */
	flush(): void;
}

/**
 * Buffers arbitrary chunks and emits one call to `onLine` per complete,
 * non-blank line -- CRLF and LF both normalize to no trailing terminator.
 * A trailing partial line with no newline yet is held until either a later
 * chunk completes it, or flush() is called.
 */
export function createLineSplitter(onLine: (line: string) => void): LineSplitter {
	const decoder = new StringDecoder("utf8");
	let buffer = "";

	function emitLine(rawLine: string): void {
		const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
		if (line) onLine(line);
	}

	return {
		feed(chunk: Buffer): void {
			buffer += decoder.write(chunk);
			for (let index = buffer.indexOf("\n"); index !== -1; index = buffer.indexOf("\n")) {
				emitLine(buffer.slice(0, index));
				buffer = buffer.slice(index + 1);
			}
		},
		flush(): void {
			buffer += decoder.end();
			if (buffer) {
				emitLine(buffer);
				buffer = "";
			}
		},
	};
}
