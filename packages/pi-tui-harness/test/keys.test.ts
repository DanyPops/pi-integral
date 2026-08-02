import { describe, expect, it } from "bun:test";
import { matchesKey } from "@earendil-works/pi-tui";
import { encodeKey } from "../src/keys.js";

describe("encodeKey", () => {
	it("encodes a plain letter as itself", () => {
		expect(encodeKey("a")).toBe("a");
		expect(encodeKey("z")).toBe("z");
	});

	it("encodes a digit as itself", () => {
		expect(encodeKey("5")).toBe("5");
	});

	it("encodes a symbol key as itself", () => {
		expect(encodeKey("-")).toBe("-");
		expect(encodeKey(":")).toBe(":");
	});

	it("encodes space as a literal space", () => {
		expect(encodeKey("space")).toBe(" ");
	});

	it.each([
		["enter", "\r"],
		["return", "\r"],
		["escape", "\x1b"],
		["esc", "\x1b"],
		["tab", "\t"],
		["backspace", "\x7f"],
		["up", "\x1b[A"],
		["down", "\x1b[B"],
		["right", "\x1b[C"],
		["left", "\x1b[D"],
		["home", "\x1b[H"],
		["end", "\x1b[F"],
		["delete", "\x1b[3~"],
		["pageUp", "\x1b[5~"],
		["pageDown", "\x1b[6~"],
	])("encodes special key %s to its real legacy sequence, recognized by pi-tui's own matchesKey", (keyId, expected) => {
		const encoded = encodeKey(keyId as Parameters<typeof encodeKey>[0]);
		expect(encoded).toBe(expected);
		expect(matchesKey(encoded, keyId as Parameters<typeof matchesKey>[1])).toBe(true);
	});

	it("encodes shift+tab to the real legacy back-tab sequence", () => {
		const encoded = encodeKey("shift+tab");
		expect(encoded).toBe("\x1b[Z");
		expect(matchesKey(encoded, "shift+tab")).toBe(true);
	});

	it.each([
		["ctrl+c", "\x03"],
		["ctrl+d", "\x04"],
		["ctrl+z", "\x1a"],
		["ctrl+a", "\x01"],
	])("encodes ctrl+letter combinations to their real control-code sequence, recognized by matchesKey", (keyId, expected) => {
		const encoded = encodeKey(keyId as Parameters<typeof encodeKey>[0]);
		expect(encoded).toBe(expected);
		expect(matchesKey(encoded, keyId as Parameters<typeof matchesKey>[1])).toBe(true);
	});

	it("throws a clear error for a key identifier it doesn't know how to encode as a legacy sequence", () => {
		// alt+shift+f7 has no simple legacy encoding -- callers needing this must use the raw handleInput escape hatch.
		expect(() => encodeKey("alt+shift+f7" as Parameters<typeof encodeKey>[0])).toThrow(/does not support encoding/);
	});
});
