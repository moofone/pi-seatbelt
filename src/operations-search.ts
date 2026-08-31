import path from "node:path";
import type { FindOperations } from "@earendil-works/pi-coding-agent";
import type { RunSandboxedArgv } from "./operations-fs.ts";
import { runSandboxedArgv } from "./sandbox-exec.ts";

export type GrepExecuteParams = {
	pattern: string;
	path?: string;
	glob?: string;
	ignoreCase?: boolean;
	literal?: boolean;
	context?: number;
	limit?: number;
};

export type GrepExecuteResult = {
	content: Array<{ type: "text"; text: string }>;
	details?: { matchLimitReached?: number };
};

/** Run rg through the sandbox helper. Never spawn rg unsandboxed. */
export async function executeSandboxedGrep(
	params: GrepExecuteParams,
	options: { cwd: string; signal?: AbortSignal; runArgv?: RunSandboxedArgv },
): Promise<GrepExecuteResult> {
	const runArgv = options.runArgv ?? runSandboxedArgv;
	const searchPath = path.resolve(options.cwd, params.path || ".");
	const argv: string[] = ["rg", "--line-number", "--color=never", "--hidden"];
	if (params.ignoreCase) argv.push("--ignore-case");
	if (params.literal) argv.push("--fixed-strings");
	if (params.glob) argv.push("--glob", params.glob);
	if (params.context && params.context > 0) argv.push("--context", String(params.context));
	argv.push("--", params.pattern, searchPath);

	const result = await runArgv(argv, { cwd: options.cwd, signal: options.signal });
	if (result.exitCode !== 0 && result.exitCode !== 1) {
		throw new Error(result.stderr.toString().trim() || `rg exited ${result.exitCode}`);
	}

	const lines = result.stdout
		.toString()
		.split("\n")
		.filter((line) => line !== "");
	const limit = Math.max(1, params.limit ?? 100);
	const clipped = lines.slice(0, limit);
	const text = clipped.length > 0 ? clipped.join("\n") : "No matches found";
	return {
		content: [{ type: "text", text }],
		details: lines.length > limit ? { matchLimitReached: limit } : undefined,
	};
}

/** FindOperations.glob via sandboxed fd so the built-in unsandboxed fd spawn is never used. */
export function createSandboxedFindOps(runArgv: RunSandboxedArgv = runSandboxedArgv): FindOperations {
	return {
		exists: async (absolutePath) => {
			const result = await runArgv(["test", "-e", absolutePath]);
			return result.exitCode === 0;
		},
		glob: async (pattern, cwd, { ignore, limit }) => {
			const argv = ["fd", "--glob", pattern, "--hidden", "--max-results", String(limit)];
			for (const entry of ignore) {
				argv.push("--exclude", entry);
			}
			argv.push(".");
			const result = await runArgv(argv, { cwd });
			if (result.exitCode !== 0 && result.exitCode !== 1) {
				throw new Error(result.stderr.toString().trim() || `fd exited ${result.exitCode}`);
			}
			return result.stdout
				.toString()
				.split("\n")
				.filter((line) => line !== "")
				.slice(0, limit);
		},
	};
}
