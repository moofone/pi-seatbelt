import { spawn as defaultSpawn } from "node:child_process";
import { SandboxManager, type ISandboxManager } from "@anthropic-ai/sandbox-runtime";

export type SandboxWrapManager = Pick<ISandboxManager, "wrapWithSandbox" | "wrapWithSandboxArgv">;

export type SandboxRunResult = {
	exitCode: number | null;
	stdout: Buffer;
	stderr: Buffer;
};

type SpawnChild = {
	pid?: number;
	stdout?: { on: (event: "data", cb: (chunk: Buffer) => void) => void };
	stderr?: { on: (event: "data", cb: (chunk: Buffer) => void) => void };
	stdin?: { write: (chunk: Buffer) => unknown; end: () => void } | null;
	kill: (signal?: NodeJS.Signals) => unknown;
	on: (event: "error" | "close", cb: (...args: unknown[]) => void) => void;
};

export type SandboxSpawn = (
	command: string,
	args: readonly string[],
	options: {
		cwd?: string;
		env?: NodeJS.ProcessEnv;
		detached?: boolean;
		stdio?: Array<"pipe" | "ignore">;
	},
) => SpawnChild;

export type SandboxRunOptions = {
	cwd?: string;
	env?: NodeJS.ProcessEnv;
	signal?: AbortSignal;
	/** Timeout in seconds (same unit as BashOperations). */
	timeout?: number;
	onData?: (data: Buffer) => void;
	stdin?: Buffer | string;
	manager?: SandboxWrapManager;
	spawn?: SandboxSpawn;
};

function shellQuote(argv: readonly string[]): string {
	return argv.map((arg) => `'${arg.replace(/'/g, `'\\''`)}'`).join(" ");
}

function killProcessGroup(child: SpawnChild): void {
	if (child.pid) {
		try {
			process.kill(-child.pid, "SIGKILL");
			return;
		} catch {
			// fall through to child.kill
		}
	}
	try {
		child.kill("SIGKILL");
	} catch {
		// already exited
	}
}

function spawnWrapped(
	command: string,
	args: readonly string[],
	env: NodeJS.ProcessEnv,
	options: SandboxRunOptions,
): Promise<SandboxRunResult> {
	const spawnFn = options.spawn ?? (defaultSpawn as unknown as SandboxSpawn);
	const stdinBuf =
		options.stdin === undefined
			? undefined
			: typeof options.stdin === "string"
				? Buffer.from(options.stdin)
				: options.stdin;

	return new Promise((resolve, reject) => {
		const child = spawnFn(command, args, {
			cwd: options.cwd,
			env,
			detached: true,
			stdio: [stdinBuf !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
		});

		const stdoutChunks: Buffer[] = [];
		const stderrChunks: Buffer[] = [];
		let timedOut = false;
		let timeoutHandle: ReturnType<typeof setTimeout> | undefined;

		if (options.timeout !== undefined && options.timeout > 0) {
			timeoutHandle = setTimeout(() => {
				timedOut = true;
				killProcessGroup(child);
			}, options.timeout * 1000);
		}

		child.stdout?.on("data", (chunk) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			stdoutChunks.push(buf);
			options.onData?.(buf);
		});
		child.stderr?.on("data", (chunk) => {
			const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			stderrChunks.push(buf);
			options.onData?.(buf);
		});

		if (stdinBuf !== undefined) {
			child.stdin?.write(stdinBuf);
			child.stdin?.end();
		}

		const onAbort = () => killProcessGroup(child);
		options.signal?.addEventListener("abort", onAbort, { once: true });

		child.on("error", (err) => {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			options.signal?.removeEventListener("abort", onAbort);
			reject(err);
		});

		child.on("close", (code) => {
			if (timeoutHandle) clearTimeout(timeoutHandle);
			options.signal?.removeEventListener("abort", onAbort);

			if (options.signal?.aborted) {
				reject(new Error("aborted"));
			} else if (timedOut) {
				reject(new Error(`timeout:${options.timeout}`));
			} else {
				resolve({
					exitCode: typeof code === "number" ? code : null,
					stdout: Buffer.concat(stdoutChunks),
					stderr: Buffer.concat(stderrChunks),
				});
			}
		});
	});
}

/** Run an argv vector only after wrapWithSandboxArgv. Fail closed if wrap rejects. */
export async function runSandboxedArgv(
	argv: readonly string[],
	options: SandboxRunOptions = {},
): Promise<SandboxRunResult> {
	if (argv.length === 0) {
		throw new Error("runSandboxedArgv requires a non-empty argv");
	}
	const manager = options.manager ?? SandboxManager;
	const command = shellQuote(argv);
	const wrapped = await manager.wrapWithSandboxArgv(
		command,
		undefined,
		undefined,
		options.signal,
		options.cwd,
	);
	if (!wrapped?.argv?.length) {
		throw new Error("wrapWithSandboxArgv returned an empty argv");
	}
	const [cmd, ...args] = wrapped.argv;
	const env = { ...wrapped.env, ...options.env };
	return spawnWrapped(cmd, args, env, options);
}

/** Run a bash -c string only after wrapWithSandbox. Fail closed if wrap rejects. */
export async function runSandboxedBash(
	command: string,
	options: SandboxRunOptions = {},
): Promise<SandboxRunResult> {
	const manager = options.manager ?? SandboxManager;
	const wrappedCommand = await manager.wrapWithSandbox(
		command,
		undefined,
		undefined,
		options.signal,
	);
	const env = { ...process.env, ...options.env };
	return spawnWrapped("bash", ["-c", wrappedCommand], env, options);
}
