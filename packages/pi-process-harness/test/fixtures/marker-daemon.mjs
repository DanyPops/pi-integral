// A trivial stand-in "daemon": writes a marker file after a short delay,
// then waits to be killed. Used by companion-daemon.test.ts to exercise
// real process spawning + readiness polling + graceful shutdown against a
// real process, not a mocked child_process module.
import { writeFileSync } from "node:fs";

const markerPath = process.argv[2];
const delayMs = Number(process.argv[3] ?? "300");

setTimeout(() => {
	writeFileSync(markerPath, "ready\n");
}, delayMs);

process.on("SIGTERM", () => process.exit(0));
setInterval(() => {}, 60_000);
