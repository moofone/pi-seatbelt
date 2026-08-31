import path from "node:path";
import type {
	EditOperations,
	LsOperations,
	ReadOperations,
	WriteOperations,
} from "@earendil-works/pi-coding-agent";
import { runSandboxedArgv, type SandboxRunOptions, type SandboxRunResult } from "./sandbox-exec.ts";

export type RunSandboxedArgv = (
	argv: readonly string[],
	options?: SandboxRunOptions,
) => Promise<SandboxRunResult>;

const IMAGE_MIME = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

async function requireZero(
	runArgv: RunSandboxedArgv,
	argv: readonly string[],
	options?: SandboxRunOptions,
): Promise<SandboxRunResult> {
	const result = await runArgv(argv, options);
	if (result.exitCode !== 0) {
		const err = result.stderr.toString().trim() || result.stdout.toString().trim();
		throw new Error(err || `${argv[0]} exited ${result.exitCode}`);
	}
	return result;
}

export function createSandboxedReadOps(runArgv: RunSandboxedArgv = runSandboxedArgv): ReadOperations {
	return {
		readFile: async (absolutePath) => {
			const result = await requireZero(runArgv, ["cat", absolutePath]);
			return result.stdout;
		},
		access: async (absolutePath) => {
			await requireZero(runArgv, ["test", "-r", absolutePath]);
		},
		detectImageMimeType: async (absolutePath) => {
			const result = await runArgv(["file", "--mime-type", "-b", absolutePath]);
			if (result.exitCode !== 0) return null;
			const mime = result.stdout.toString().trim();
			return IMAGE_MIME.has(mime) ? mime : null;
		},
	};
}

export function createSandboxedWriteOps(runArgv: RunSandboxedArgv = runSandboxedArgv): WriteOperations {
	return {
		writeFile: async (absolutePath, content) => {
			const dir = path.dirname(absolutePath);
			if (dir && dir !== ".") {
				await requireZero(runArgv, ["mkdir", "-p", dir]);
			}
			await requireZero(runArgv, ["tee", absolutePath], { stdin: Buffer.from(content) });
		},
		mkdir: async (dir) => {
			await requireZero(runArgv, ["mkdir", "-p", dir]);
		},
	};
}

export function createSandboxedEditOps(runArgv: RunSandboxedArgv = runSandboxedArgv): EditOperations {
	const read = createSandboxedReadOps(runArgv);
	const write = createSandboxedWriteOps(runArgv);
	return {
		readFile: read.readFile,
		writeFile: write.writeFile,
		access: async (absolutePath) => {
			await requireZero(runArgv, ["test", "-rw", absolutePath]);
		},
	};
}

export function createSandboxedLsOps(runArgv: RunSandboxedArgv = runSandboxedArgv): LsOperations {
	return {
		exists: async (absolutePath) => {
			const result = await runArgv(["test", "-e", absolutePath]);
			return result.exitCode === 0;
		},
		stat: async (absolutePath) => {
			const exists = await runArgv(["test", "-e", absolutePath]);
			if (exists.exitCode !== 0) {
				throw new Error(`ENOENT: ${absolutePath}`);
			}
			const dir = await runArgv(["test", "-d", absolutePath]);
			return { isDirectory: () => dir.exitCode === 0 };
		},
		readdir: async (absolutePath) => {
			const result = await requireZero(runArgv, ["ls", "-1A", absolutePath]);
			return result.stdout
				.toString()
				.split("\n")
				.filter((line) => line !== "");
		},
	};
}
