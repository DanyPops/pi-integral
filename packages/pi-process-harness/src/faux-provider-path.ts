import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the faux-provider-extension's real `.ts` source path -- always
 * the source, never a compiled dist counterpart, since Pi's own jiti-based
 * extension loader transforms `.ts` directly (the same load path
 * `@danypops/pi-extension-harness`'s `loadExtensionViaJiti` exercises).
 * This module's own directory is always exactly one level below the
 * package root, whether it's `dist/faux-provider-path.js` (published,
 * normal usage) or `src/faux-provider-path.ts` (this package's own tests
 * importing straight from source) -- so the same relative walk-up finds
 * `src/fixtures/faux-provider-extension.ts` either way.
 */
export function resolveFauxProviderExtensionPath(): string {
	const hereDir = dirname(fileURLToPath(import.meta.url));
	return join(hereDir, "..", "src", "fixtures", "faux-provider-extension.ts");
}
