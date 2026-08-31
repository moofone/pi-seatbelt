import os from "node:os";
import path from "node:path";
import type { SandboxRuntimeConfig } from "@anthropic-ai/sandbox-runtime";

/** Hardcoded write root for product worktrees. Orchestrator/home/Documents are not writable. */
export const GIT_WRITE_ROOT = "/Users/greg/Dev/git";

/** Absolute ripgrep binary. The Pi grep tool and sandboxed search must use this, never BSD/GNU grep. */
export const RIPGREP_BIN = "/opt/homebrew/bin/rg";

/** BSD/GNU grep (and egrep/fgrep) paths. denyRead blocks exec; OS policy is the gate. */
export const GREP_DENY_READ = [
	"/usr/bin/grep",
	"/usr/bin/egrep",
	"/usr/bin/fgrep",
	"/bin/grep",
	"/bin/egrep",
	"/bin/fgrep",
	"/opt/homebrew/bin/grep",
	"/opt/homebrew/bin/ggrep",
	"/usr/local/bin/grep",
	"/usr/local/bin/ggrep",
] as const;

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
				...GREP_DENY_READ,
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
