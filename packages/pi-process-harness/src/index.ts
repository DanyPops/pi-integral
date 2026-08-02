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
export { type RealPiProcess, type SpawnPiProcessOptions, spawnRealPiProcess, waitForRpcEvent } from "./pi-process.js";
export type { PiRpcCommand, PiRpcEvent } from "./rpc-protocol.js";
