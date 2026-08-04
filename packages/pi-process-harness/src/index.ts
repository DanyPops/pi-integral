export {
	type CompanionDaemon,
	CompanionDaemonReadyTimeoutError,
	type SpawnCompanionDaemonOptions,
	spawnCompanionDaemon,
} from "./companion-daemon.js";
export { resolveFauxProviderExtensionPath } from "./faux-provider-path.js";
export {
	decodeFauxScript,
	encodeFauxScript,
	type FauxScriptStep,
	type FauxTextStep,
	type FauxToolCallStep,
	SCRIPT_ENV_VAR,
} from "./faux-script.js";
export { type ManagedProcess, type SpawnManagedProcessOptions, spawnManagedProcess } from "./managed-process.js";
export { type RealPiProcess, type SpawnPiProcessOptions, spawnRealPiProcess, waitForRpcEvent } from "./pi-process.js";
export { resolvePiCliPath } from "./resolve-pi-cli-path.js";
export { extractMessageText } from "./rpc-protocol.js";
export {
	type CliCompletion,
	CliOutputLimitError,
	type RunCliToCompletionOptions,
	runCliToCompletion,
} from "./run-cli-to-completion.js";
