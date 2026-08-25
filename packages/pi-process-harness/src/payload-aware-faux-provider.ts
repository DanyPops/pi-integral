import {
	type Api,
	type ApiStreamOptions,
	type Context,
	createAssistantMessageEventStream,
	type Model,
	type Provider,
	type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { FIRST_TOKEN_DELAY_ENV_VAR } from "./faux-script.js";

function firstTokenDelay(): Promise<void> {
	const milliseconds = Number(process.env[FIRST_TOKEN_DELAY_ENV_VAR] ?? "0");
	return Number.isFinite(milliseconds) && milliseconds > 0
		? new Promise((resolve) => setTimeout(resolve, milliseconds))
		: Promise.resolve();
}

/**
 * Adds the provider-payload lifecycle seam to pi-ai's in-memory faux provider.
 *
 * Real HTTP providers call `options.onPayload` after serializing their final request. The faux
 * provider intentionally has no wire payload and currently skips that callback, which leaves
 * process-level extension tests unable to exercise `before_provider_request`. This wrapper emits
 * a deterministic provider-neutral payload at the same stream boundary, waits for the callback,
 * then delegates to faux. Returned rewrites are observational only because faux consumes Context,
 * not a provider wire shape; tests that need provider-specific rewrite semantics still require a
 * local HTTP provider fake.
 */
export function payloadAwareFauxProvider<TApi extends Api>(provider: Provider<TApi>): Provider<TApi> {
	const stream = provider.stream.bind(provider);
	const streamSimple = provider.streamSimple.bind(provider);
	const payload = (context: Context) => ({
		system: context.systemPrompt,
		messages: context.messages,
		tools: context.tools ?? [],
	});
	return {
		...provider,
		stream<T extends TApi>(model: Model<T>, context: Context, options?: ApiStreamOptions<T>) {
			const outer = createAssistantMessageEventStream();
			queueMicrotask(async () => {
				try {
					await options?.onPayload?.(payload(context), model);
				} catch {
					// Mirrors Pi's extension-runner isolation: observational hook failures cannot break faux.
				}
				const { onPayload: _onPayload, ...delegatedOptions } = options ?? {};
				await firstTokenDelay();
				const delegated = stream(model, context, delegatedOptions as ApiStreamOptions<T>);
				for await (const event of delegated) outer.push(event);
			});
			return outer;
		},
		streamSimple(model: Model<TApi>, context: Context, options?: SimpleStreamOptions) {
			const outer = createAssistantMessageEventStream();
			queueMicrotask(async () => {
				try {
					await options?.onPayload?.(payload(context), model);
				} catch {
					// Mirrors Pi's extension-runner isolation: observational hook failures cannot break faux.
				}
				const { onPayload: _onPayload, ...delegatedOptions } = options ?? {};
				await firstTokenDelay();
				const delegated = streamSimple(model, context, delegatedOptions as SimpleStreamOptions);
				for await (const event of delegated) outer.push(event);
			});
			return outer;
		},
	};
}
