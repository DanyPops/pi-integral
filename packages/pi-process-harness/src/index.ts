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
	FIRST_TOKEN_DELAY_ENV_VAR,
	SCRIPT_ENV_VAR,
} from "./faux-script.js";
export { type ManagedProcess, type SpawnManagedProcessOptions, spawnManagedProcess } from "./managed-process.js";
export { payloadAwareFauxProvider } from "./payload-aware-faux-provider.js";
export {
	type PiStartupTimingSnapshot,
	type RealPiProcess,
	type SpawnPiProcessOptions,
	spawnRealPiProcess,
	type TimedPiEvent,
	waitForRpcEvent,
} from "./pi-process.js";
export { resolvePiCliPath } from "./resolve-pi-cli-path.js";
export { extractMessageText } from "./rpc-protocol.js";
export {
	type CliCompletion,
	CliOutputLimitError,
	type RunCliToCompletionOptions,
	runCliToCompletion,
} from "./run-cli-to-completion.js";
