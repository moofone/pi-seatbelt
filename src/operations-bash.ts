import type { BashOperations } from "@earendil-works/pi-coding-agent";
import { runSandboxedBash, type SandboxRunOptions, type SandboxRunResult } from "./sandbox-exec.ts";

export type RunSandboxedBash = (
	command: string,
	options?: SandboxRunOptions,
) => Promise<SandboxRunResult>;

export function createSandboxedBashOps(options: { runBash?: RunSandboxedBash } = {}): BashOperations {
	const runBash = options.runBash ?? runSandboxedBash;
	return {
		async exec(command, cwd, { onData, signal, timeout, env }) {
			const result = await runBash(command, { cwd, env, signal, timeout, onData });
			return { exitCode: result.exitCode };
		},
	};
}
