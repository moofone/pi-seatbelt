import type { BashOperations } from "@earendil-works/pi-coding-agent";
import {
	runSandboxedBash,
	type SandboxRunOptions,
	type SandboxRunResult,
	type SandboxWrapManager,
} from "./sandbox-exec.ts";

export type RunSandboxedBash = (
	command: string,
	options?: SandboxRunOptions,
) => Promise<SandboxRunResult>;

export function createSandboxedBashOps(
	options: { runBash?: RunSandboxedBash; manager?: SandboxWrapManager } = {},
): BashOperations {
	const runBash = options.runBash ?? runSandboxedBash;
	return {
		async exec(command, cwd, { onData, signal, timeout, env }) {
			const runOptions: SandboxRunOptions = { cwd, env, signal, timeout, onData };
			if (options.manager) runOptions.manager = options.manager;
			const result = await runBash(command, runOptions);
			return { exitCode: result.exitCode };
		},
	};
}
