import type { KeyId } from "@earendil-works/pi-tui";

const SPECIAL_SEQUENCES: Partial<Record<KeyId, string>> = {
	space: " ",
	enter: "\r",
	return: "\r",
	escape: "\x1b",
	esc: "\x1b",
	tab: "\t",
	"shift+tab": "\x1b[Z",
	backspace: "\x7f",
	delete: "\x1b[3~",
	insert: "\x1b[2~",
	home: "\x1b[H",
	end: "\x1b[F",
	up: "\x1b[A",
	down: "\x1b[B",
	right: "\x1b[C",
	left: "\x1b[D",
	pageUp: "\x1b[5~",
	pageDown: "\x1b[6~",
	f1: "\x1bOP",
	f2: "\x1bOQ",
	f3: "\x1bOR",
	f4: "\x1bOS",
	f5: "\x1b[15~",
	f6: "\x1b[17~",
	f7: "\x1b[18~",
	f8: "\x1b[19~",
	f9: "\x1b[20~",
	f10: "\x1b[21~",
	f11: "\x1b[23~",
	f12: "\x1b[24~",
};

const SINGLE_CHAR_KEY = /^[a-z0-9`\-=[\]\\;',./!@#$%^&*()_+|~{}:<>?]$/;

/** Matches pi-tui's own rawCtrlChar formula: code & 0x1f, letters a-z only. */
function ctrlControlCode(letter: string): string | undefined {
	if (letter.length !== 1 || letter < "a" || letter > "z") return undefined;
	return String.fromCharCode(letter.charCodeAt(0) & 0x1f);
}

/**
 * Encodes a KeyId (as accepted by pi-tui's own matchesKey) into the real
 * legacy terminal byte sequence a terminal would actually send for it --
 * the encode direction matchesKey/parseKey deliberately don't provide.
 * Covers plain characters, the common named specials, and ctrl+<letter>
 * control codes; anything else (Kitty-protocol-only combinations,
 * alt+<key>, most modifier combinations beyond ctrl+letter) has no simple
 * legacy encoding and throws rather than guessing at a sequence that
 * wouldn't actually match matchesKey.
 */
export function encodeKey(keyId: KeyId): string {
	const special = SPECIAL_SEQUENCES[keyId];
	if (special !== undefined) return special;

	if (SINGLE_CHAR_KEY.test(keyId)) return keyId;

	if (keyId.startsWith("ctrl+") && !keyId.includes("shift") && !keyId.includes("alt") && !keyId.includes("super")) {
		const letter = keyId.slice("ctrl+".length);
		const code = ctrlControlCode(letter);
		if (code !== undefined) return code;
	}

	throw new Error(
		`encodeKey: "${keyId}" does not support encoding as a legacy terminal sequence. ` +
			"Use component.handleInput() directly with a raw escape sequence for Kitty-protocol-only or complex modifier combinations.",
	);
}
