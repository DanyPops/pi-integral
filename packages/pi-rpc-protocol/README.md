# @danypops/pi-rpc-protocol

Dependency-free parsing and encoding for the subset of Pi's documented RPC protocol needed by clients speaking to a `pi --mode rpc` process.

## Usage

```ts
import { encodeRpcCommand, parseRpcLine } from "@danypops/pi-rpc-protocol";

childProcess.stdin.write(encodeRpcCommand({ type: "prompt", message: "hello" }));

for (const line of stdoutLines) {
	const event = parseRpcLine(line);
	if (event?.type === "tool_execution_end") {
		console.log(event.toolName, event.result, event.isError);
	}
}
```

## Scope

- Encodes `prompt`, `abort`, and `extension_ui_response` commands.
- Parses lifecycle, response, message, tool-execution, and extension UI events.
- Preserves unrecognized valid events as `unknown-event` values.
- Extracts plain text from Pi message content.

Process spawning and session management belong in `@danypops/pi-process-harness` and Epi.

## License

MIT
