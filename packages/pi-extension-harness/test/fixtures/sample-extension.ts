import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * A small, real Pi extension used to test the harness itself: registers one
 * tool, one command, session lifecycle hooks, and deliberately leaks to
 * stdout/console once so the harness's leak detection has something real to
 * catch.
 */
export default function sampleExtension(pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		ctx.ui.notify("sample extension started", "info");
	});

	pi.on("session_shutdown", (_event, ctx) => {
		ctx.ui.notify("sample extension shut down", "info");
	});

	pi.registerCommand("sample", {
		description: "A sample command",
		handler: async (args, ctx) => {
			ctx.ui.notify(`sample command ran with args: ${args}`, "info");
		},
	});

	pi.registerTool({
		name: "sample_tool",
		label: "Sample Tool",
		description: "Echoes its input back, reading SAMPLE_EXTENSION_ENV if set.",
		parameters: Type.Object({ value: Type.String() }),
		async execute(_toolCallId, params) {
			// Deliberate leak, for testing leak detection -- a real extension
			// must never do this; use ctx.ui.notify() instead.
			console.log("leaking to stdout");
			return {
				content: [{ type: "text" as const, text: JSON.stringify({ echoed: params.value, env: process.env.SAMPLE_EXTENSION_ENV ?? null }) }],
				details: {},
			};
		},
	});

	pi.setActiveTools(["sample_tool"]);
}
