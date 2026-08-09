/**
 * A real Pi extension: registers Pi's own first-party faux model provider
 * (`@earendil-works/pi-ai`'s `fauxProvider`), scripted from the
 * `PI_PROCESS_HARNESS_SCRIPT` env var, so a real `pi --mode rpc` process
 * makes a real agent-loop decision to call a tool (or emit text) without
 * a live LLM call. Pass alongside a consumer's own extension (the one
 * registering the tool(s) actually under test) via multiple `--extension`
 * flags. `resolveFauxProviderExtensionPath()` in `pi-process.ts`'s sibling
 * module returns this file's real path for that purpose.
 */
import { fauxAssistantMessage, fauxProvider, fauxText, fauxToolCall } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { decodeFauxScript, type FauxScriptStep, SCRIPT_ENV_VAR } from "../faux-script.js";
import { payloadAwareFauxProvider } from "../payload-aware-faux-provider.js";

function toAssistantMessage(step: FauxScriptStep) {
	return step.type === "text" ? fauxAssistantMessage(fauxText(step.text)) : fauxAssistantMessage(fauxToolCall(step.name, step.arguments));
}

export default function (pi: ExtensionAPI): void {
	const raw = process.env[SCRIPT_ENV_VAR];
	if (!raw) {
		throw new Error(`faux-provider-extension loaded but ${SCRIPT_ENV_VAR} is unset -- nothing to script`);
	}
	const steps = decodeFauxScript(raw);
	const handle = fauxProvider();
	pi.registerProvider(payloadAwareFauxProvider(handle.provider));
	handle.setResponses(steps.map(toAssistantMessage));
}
