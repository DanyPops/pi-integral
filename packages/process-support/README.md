# @danypops/process-support

Shared process-spawning primitives, not Pi-specific: bounded stderr capture,
graceful-then-forceful shutdown, and NDJSON/line-buffered stdout parsing.

Extracted from real duplication between
[`@danypops/pi-process-harness`](../pi-process-harness)'s `spawnRealPiProcess`
and `spawnCompanionDaemon`, which had each independently implemented the same
spawn/stderr/shutdown logic.

## Install

```
npm install @danypops/process-support
```

## `spawnManagedProcess`

```ts
import { spawnManagedProcess } from "@danypops/process-support";

const proc = spawnManagedProcess({ command: "node", args: ["server.js"] });

proc.onStdout((chunk) => process.stdout.write(chunk));
proc.write("some input\n");

await proc.dispose(); // SIGTERM, then SIGKILL after a grace period if it doesn't exit
```

`exitCode` is `null` both while the process is still running **and** when it
was terminated by a signal -- matching Node's own `subprocess.exitCode`
semantics exactly. Use `hasExited` to ask "is it actually dead" and
`signalCode` to ask "was it killed by a signal", rather than inferring either
from `exitCode` alone.

## `createLineSplitter`

Buffers arbitrary chunks -- which may split a line, or even a multi-byte
UTF-8 character, at any byte boundary -- and emits one call per complete,
non-blank line.

```ts
import { createLineSplitter } from "@danypops/process-support";

const feed = createLineSplitter((line) => console.log("line:", line));
proc.onStdout((chunk) => feed(chunk));
```
