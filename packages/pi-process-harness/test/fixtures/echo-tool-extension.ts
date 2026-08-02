import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/** Registers one real tool, `echo_tool`, so the harness's own self-test can prove a scripted faux tool call actually executes a real registered tool -- not just that the RPC stream reports it. */
export default function (pi: ExtensionAPI): void {
	pi.registerTool({
		name: "echo_tool",
		label: "Echo",
		description: "Echoes its input back.",
		parameters: Type.Object({ message: Type.String() }),
		async execute(_toolCallId, params) {
			return { content: [{ type: "text", text: `echo: ${params.message}` }], details: {} };
		},
	});
}
