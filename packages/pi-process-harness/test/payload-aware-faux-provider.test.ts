import { describe, expect, it } from "bun:test";
import { fauxAssistantMessage, fauxProvider, fauxText } from "@earendil-works/pi-ai";
import { payloadAwareFauxProvider } from "../src/payload-aware-faux-provider.ts";

describe("payloadAwareFauxProvider", () => {
	const context = {
		systemPrompt: "private system",
		messages: [{ role: "user" as const, content: "private prompt", timestamp: 1 }],
		tools: [],
	};
	const expectedPayload = {
		system: "private system",
		messages: [{ role: "user", content: "private prompt", timestamp: 1 }],
		tools: [],
	};

	it("drives Pi's provider-payload callback at the real streamSimple boundary", async () => {
		const handle = fauxProvider();
		handle.setResponses([fauxAssistantMessage(fauxText("response"))]);
		const provider = payloadAwareFauxProvider(handle.provider);
		const payloads: unknown[] = [];
		const stream = provider.streamSimple(handle.getModel(), context, {
			onPayload(payload) {
				payloads.push(payload);
				return payload;
			},
		});
		for await (const _event of stream) {
			// Drain the same asynchronous stream a real Pi agent consumes.
		}
		expect(payloads).toEqual([expectedPayload]);
	});

	it("drives the same callback contract through the full stream boundary", async () => {
		const handle = fauxProvider();
		handle.setResponses([fauxAssistantMessage(fauxText("response"))]);
		const provider = payloadAwareFauxProvider(handle.provider);
		const payloads: unknown[] = [];
		const stream = provider.stream(handle.getModel(), context, {
			onPayload(payload) {
				payloads.push(payload);
				return payload;
			},
		});
		for await (const _event of stream) {
			// Drain the same asynchronous stream a real Pi agent consumes.
		}
		expect(payloads).toEqual([expectedPayload]);
	});
});
