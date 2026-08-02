import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Resolves the installed @earendil-works/pi-coding-agent's own dist/cli.js
 * -- the same file its own "pi" bin entry points at -- as an absolute path.
 * RpcClient's own cliPath option defaults to the relative "dist/cli.js",
 * correct only from inside pi-mono's own repo; an external consumer needs
 * the real resolved path to the installed package instead. cli.js and
 * index.js are published side by side in the same dist/ directory, so
 * resolving the package's main entry and swapping the filename is reliable
 * without needing an explicit "./dist/cli.js" export subpath (which the
 * package does not declare).
 */
export function resolvePiCliPath(): string {
	const indexUrl = import.meta.resolve("@earendil-works/pi-coding-agent");
	return join(dirname(fileURLToPath(indexUrl)), "cli.js");
}
