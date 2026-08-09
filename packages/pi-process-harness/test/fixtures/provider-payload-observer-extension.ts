import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI): void {
	pi.on("before_provider_request", (_event, ctx) => {
		ctx.ui.setStatus("provider-payload-observed", "observed");
	});
}
