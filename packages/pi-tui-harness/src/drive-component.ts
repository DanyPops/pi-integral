import type { Component, KeyId } from "@earendil-works/pi-tui";
import { encodeKey } from "./keys.js";

export interface DrivenComponent {
	/** The wrapped component -- for anything a caller needs directly (invalidate(), custom fields, etc.). */
	readonly component: Component;
	render(width: number): string[];
	/** Encodes one named key (see @earendil-works/pi-tui's KeyId) to its real legacy sequence and forwards it to handleInput(). */
	pressKey(keyId: KeyId): void;
	/** pressKey() for each key in order -- a short scripted interaction in one call. */
	pressKeys(keyIds: readonly KeyId[]): void;
	/** Forwards each character of `text` as its own handleInput() call, in order -- matches a real terminal delivering typed input one byte/character at a time. */
	type(text: string): void;
	/** Forwards an arbitrary raw sequence verbatim -- the escape hatch for anything encodeKey can't cover (Kitty-only sequences, uncommon modifier combinations). */
	sendRaw(data: string): void;
}

function requireHandleInput(component: Component): (data: string) => void {
	if (!component.handleInput) {
		throw new Error("driveComponent: this component does not implement handleInput -- it cannot receive keyboard input at all.");
	}
	return component.handleInput.bind(component);
}

/** Wraps a real @earendil-works/pi-tui Component with named-key input helpers -- the fast, in-process layer: no real terminal, no ANSI interpretation, just direct handleInput() calls with real legacy byte sequences. */
export function driveComponent(component: Component): DrivenComponent {
	return {
		component,
		render: (width) => component.render(width),
		pressKey(keyId) {
			requireHandleInput(component)(encodeKey(keyId));
		},
		pressKeys(keyIds) {
			const send = requireHandleInput(component);
			for (const keyId of keyIds) send(encodeKey(keyId));
		},
		type(text) {
			const send = requireHandleInput(component);
			for (const char of text) send(char);
		},
		sendRaw(data) {
			requireHandleInput(component)(data);
		},
	};
}
