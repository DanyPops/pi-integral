import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

/**
 * Registers one real tool shaped like a search tool (a `pattern` input arg, a text result) so
 * this package's own integration test can prove its real matching/rollup logic against a
 * genuine scripted tool call, not just a hand-authored event fixture.
 */
export default function (pi: ExtensionAPI): void {
	pi.registerTool({
		name: "search_like_tool",
		label: "Search-like",
		description: "Returns a canned match for a given pattern.",
		parameters: Type.Object({ pattern: Type.String() }),
		async execute(_toolCallId, params) {
			return { content: [{ type: "text", text: `1 match for ${params.pattern}` }], details: {} };
		},
	});
}
