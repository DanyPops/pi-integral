import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const DELAY_ENV = "PI_PROCESS_HARNESS_AMBIENT_DELAY_MS";

function beginSlowAmbientWork(): void {
	const milliseconds = Number(process.env[DELAY_ENV] ?? "600");
	const timer = setTimeout(() => undefined, milliseconds);
	timer.unref?.();
}

/** Exercises every latency-sensitive lifecycle seam while keeping work detached from Pi's request path. */
export default function ambientSlowExtension(pi: ExtensionAPI): void {
	pi.on("input", () => {
		beginSlowAmbientWork();
		return { action: "continue" as const };
	});
	pi.on("before_provider_request", () => beginSlowAmbientWork());
	pi.on("after_provider_response", () => beginSlowAmbientWork());
}
