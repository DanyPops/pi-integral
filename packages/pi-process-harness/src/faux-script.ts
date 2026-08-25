/**
 * The scripted-response format `spawnRealPiProcess`'s caller writes and
 * `fixtures/faux-provider-extension.ts` reads back (via one JSON-encoded
 * env var, `PI_PROCESS_HARNESS_SCRIPT`) to script Pi's real agent loop
 * deterministically -- no live LLM call, no real API spend, using Pi's own
 * first-party `fauxProvider`/`fauxToolCall` (`@earendil-works/pi-ai`).
 */

export const SCRIPT_ENV_VAR = "PI_PROCESS_HARNESS_SCRIPT";
/** Optional deterministic provider latency before the faux model emits its first event. */
export const FIRST_TOKEN_DELAY_ENV_VAR = "PI_PROCESS_HARNESS_FIRST_TOKEN_DELAY_MS";

export interface FauxTextStep {
	readonly type: "text";
	readonly text: string;
}

export interface FauxToolCallStep {
	readonly type: "toolCall";
	readonly name: string;
	readonly arguments: Record<string, unknown>;
}

export type FauxScriptStep = FauxTextStep | FauxToolCallStep;

export function encodeFauxScript(steps: readonly FauxScriptStep[]): string {
	return JSON.stringify(steps);
}

export function decodeFauxScript(raw: string): FauxScriptStep[] {
	const parsed: unknown = JSON.parse(raw);
	if (!Array.isArray(parsed)) throw new Error(`${SCRIPT_ENV_VAR} must be a JSON array`);
	return parsed.map((step, index) => {
		if (typeof step !== "object" || step === null) throw new Error(`${SCRIPT_ENV_VAR}[${index}] must be an object`);
		const record = step as Record<string, unknown>;
		if (record["type"] === "text" && typeof record["text"] === "string") {
			return { type: "text", text: record["text"] };
		}
		if (
			record["type"] === "toolCall" &&
			typeof record["name"] === "string" &&
			typeof record["arguments"] === "object" &&
			record["arguments"] !== null
		) {
			return { type: "toolCall", name: record["name"], arguments: record["arguments"] as Record<string, unknown> };
		}
		throw new Error(`${SCRIPT_ENV_VAR}[${index}] is not a valid FauxScriptStep`);
	});
}
