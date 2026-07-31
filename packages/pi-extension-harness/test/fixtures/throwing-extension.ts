import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * A real default-factory export that throws synchronously when Pi calls it
 * -- distinct from broken-extension.ts (no default export at all). Used to
 * test load-time crash detection: the factory itself runs and fails, rather
 * than the module failing to resolve.
 */
export default function throwingExtension(_pi: ExtensionAPI) {
	throw new Error("throwingExtension deliberately fails during registration");
}
