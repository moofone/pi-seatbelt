import { SandboxManager, type ISandboxManager } from "@anthropic-ai/sandbox-runtime";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	createBashTool,
	createEditTool,
	createFindTool,
	createGrepTool,
	createLsTool,
	createReadTool,
	createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { createSandboxedBashOps, type RunSandboxedBash } from "./operations-bash.ts";
import {
	createSandboxedEditOps,
	createSandboxedLsOps,
	createSandboxedReadOps,
	createSandboxedWriteOps,
	type RunSandboxedArgv,
} from "./operations-fs.ts";
import { createSandboxedFindOps, executeSandboxedGrep } from "./operations-search.ts";
import { buildDefaultSeatbeltConfig } from "./policy.ts";
import { runSandboxedArgv, runSandboxedBash } from "./sandbox-exec.ts";

export type SeatbeltManager = Pick<
	ISandboxManager,
	"initialize" | "reset" | "wrapWithSandbox" | "wrapWithSandboxArgv"
>;

export type SeatbeltDeps = {
	manager?: SeatbeltManager;
	runArgv?: RunSandboxedArgv;
	runBash?: RunSandboxedBash;
	platform?: NodeJS.Platform;
	home?: string;
};

export function createSeatbeltExtension(deps: SeatbeltDeps = {}) {
	return function seatbelt(pi: ExtensionAPI) {
		const manager = deps.manager ?? SandboxManager;
		const runArgv = deps.runArgv ?? runSandboxedArgv;
		const runBash = deps.runBash ?? runSandboxedBash;
		const platform = deps.platform ?? process.platform;

		pi.registerFlag("no-sandbox", {
			description: "Disable OS-level sandboxing for built-in tools",
			type: "boolean",
			default: false,
		});

		const localCwd = process.cwd();
		const localBash = createBashTool(localCwd);
		const localRead = createReadTool(localCwd);
		const localWrite = createWriteTool(localCwd);
		const localEdit = createEditTool(localCwd);
		const localLs = createLsTool(localCwd);
		const localGrep = createGrepTool(localCwd);
		const localFind = createFindTool(localCwd);

		let sandboxEnabled = false;
		let sandboxInitialized = false;

		const bashOps = () => createSandboxedBashOps({ runBash });
		const readOps = () => createSandboxedReadOps(runArgv);
		const writeOps = () => createSandboxedWriteOps(runArgv);
		const editOps = () => createSandboxedEditOps(runArgv);
		const lsOps = () => createSandboxedLsOps(runArgv);
		const findOps = () => createSandboxedFindOps(runArgv);

		pi.registerTool({
			...localBash,
			label: "bash (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localBash.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createBashTool(localCwd, { operations: bashOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.registerTool({
			...localRead,
			label: "read (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localRead.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createReadTool(localCwd, { operations: readOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.registerTool({
			...localWrite,
			label: "write (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localWrite.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createWriteTool(localCwd, { operations: writeOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.registerTool({
			...localEdit,
			label: "edit (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localEdit.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createEditTool(localCwd, { operations: editOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.registerTool({
			...localLs,
			label: "ls (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localLs.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createLsTool(localCwd, { operations: lsOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.registerTool({
			...localGrep,
			label: "grep (sandboxed)",
			async execute(_id, params, signal, _onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localGrep.execute(_id, params, signal, _onUpdate);
				}
				return executeSandboxedGrep(params, { cwd: localCwd, signal, runArgv });
			},
		});

		pi.registerTool({
			...localFind,
			label: "find (sandboxed)",
			async execute(id, params, signal, onUpdate, _ctx) {
				if (!sandboxEnabled || !sandboxInitialized) {
					return localFind.execute(id, params, signal, onUpdate);
				}
				const sandboxed = createFindTool(localCwd, { operations: findOps() });
				return sandboxed.execute(id, params, signal, onUpdate);
			},
		});

		pi.on("user_bash", () => {
			if (!sandboxEnabled || !sandboxInitialized) return;
			return { operations: bashOps() };
		});

		pi.on("session_start", async (_event, ctx) => {
			const noSandbox = pi.getFlag("no-sandbox") as boolean;
			if (noSandbox) {
				sandboxEnabled = false;
				ctx.ui.notify("Sandbox disabled via --no-sandbox", "warning");
				return;
			}

			if (platform !== "darwin" && platform !== "linux") {
				sandboxEnabled = false;
				ctx.ui.notify(`Sandbox not supported on ${platform}`, "warning");
				return;
			}

			try {
				await manager.initialize(buildDefaultSeatbeltConfig(deps.home));
				sandboxEnabled = true;
				sandboxInitialized = true;
				const config = buildDefaultSeatbeltConfig(deps.home);
				const writeCount = config.filesystem.allowWrite.length;
				ctx.ui.setStatus(
					"seatbelt",
					ctx.ui.theme.fg("accent", `🔒 Seatbelt: * net, ${writeCount} write paths`),
				);
				ctx.ui.notify("Seatbelt sandbox initialized", "info");
			} catch (err) {
				sandboxEnabled = false;
				sandboxInitialized = false;
				ctx.ui.notify(
					`Sandbox initialization failed: ${err instanceof Error ? err.message : err}`,
					"error",
				);
			}
		});

		pi.on("session_shutdown", async () => {
			if (sandboxInitialized) {
				try {
					await manager.reset();
				} catch {
					// Ignore cleanup errors
				}
				sandboxInitialized = false;
				sandboxEnabled = false;
			}
		});

		pi.registerCommand("seatbelt", {
			description: "Show seatbelt sandbox policy (allowWrite / denyRead / network)",
			handler: async (_args, ctx) => {
				const config = buildDefaultSeatbeltConfig(deps.home);
				if (!sandboxEnabled) {
					ctx.ui.notify("Seatbelt sandbox is disabled", "info");
				}
				const lines = [
					"Seatbelt Configuration:",
					"",
					"Network:",
					`  Allowed: ${config.network.allowedDomains.join(", ") || "(none)"}`,
					`  Denied: ${config.network.deniedDomains.join(", ") || "(none)"}`,
					`  Local binding: ${config.network.allowLocalBinding ? "yes" : "no"}`,
					"",
					"Filesystem:",
					`  Deny Read: ${config.filesystem.denyRead.join(", ") || "(none)"}`,
					`  Allow Write: ${config.filesystem.allowWrite.join(", ") || "(none)"}`,
					`  Deny Write: ${config.filesystem.denyWrite.join(", ") || "(none)"}`,
				];
				ctx.ui.notify(lines.join("\n"), "info");
			},
		});
	};
}

export default createSeatbeltExtension();
