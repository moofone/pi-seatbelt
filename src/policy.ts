import os from "node:os";
import path from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

/** Hardcoded write root for product worktrees. Orchestrator/home/Documents are not writable. */
export const GIT_WRITE_ROOT = "/Users/greg/Dev/git";

/**
 * Compile the default seatbelt policy as a SandboxRuntimeConfig.
 * Writes default-deny except the listed allowWrite paths. No file I/O.
 */
export function buildDefaultSeatbeltConfig(home = os.homedir()): SandboxRuntimeConfig {
	return {
		filesystem: {
			allowWrite: [
				GIT_WRITE_ROOT,
				"/tmp",
				"/private/tmp",
				"/var/folders",
				path.join(home, "Library/Caches"),
				path.join(home, ".cache"),
				path.join(home, ".npm"),
				path.join(home, ".pnpm-store"),
				path.join(home, ".yarn"),
				path.join(home, ".cargo"),
				path.join(home, ".rustup"),
				path.join(home, ".local/share"),
			],
			denyRead: [
				path.join(home, ".ssh"),
				path.join(home, ".aws"),
				path.join(home, ".gnupg"),
				path.join(home, ".netrc"),
				path.join(home, ".config/gh"),
			],
			denyWrite: [],
			allowGitConfig: true,
		},
		network: {
			allowedDomains: ["*"],
			deniedDomains: [],
			allowLocalBinding: true,
		},
	};
}
