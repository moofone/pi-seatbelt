import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createSeatbeltExtension, type SeatbeltManager } from "../src/index.ts";
import { createSandboxedFindOps, executeSandboxedGrep } from "../src/operations-search.ts";

function fakeManager(): SeatbeltManager & { resetCalls: number } {
	return {
		resetCalls: 0,
		async initialize() {},
		async reset() {
			this.resetCalls++;
		},
		async wrapWithSandbox(command: string) {
			return command;
		},
		async wrapWithSandboxArgv(command: string) {
			return { argv: ["true"], env: { ...process.env } };
		},
	};
}

function mockPi(flags: Record<string, unknown> = {}) {
	const handlers: Record<string, (...args: unknown[]) => unknown> = {};
	const tools: Array<{ name?: string; execute: Function }> = [];
	return {
		tools,
		handlers,
		registerFlag() {},
		getFlag(name: string) {
			return flags[name];
		},
		registerTool(tool: { name?: string; execute: Function }) {
			tools.push(tool);
		},
		registerCommand() {},
		on(event: string, handler: (...args: unknown[]) => unknown) {
			handlers[event] = handler;
		},
	};
}

const sessionCtx = {
	cwd: process.cwd(),
	ui: {
		notify() {},
		setStatus() {},
		theme: { fg: (_k: string, s: string) => s },
	},
};

describe("sandboxed grep and find", () => {
	it("grep execute spawns rg via runSandboxedArgv", async () => {
		const argvLog: string[][] = [];
		const runArgv = async (argv: readonly string[]) => {
			argvLog.push([...argv]);
			return { exitCode: 0, stdout: Buffer.from("src/a.ts:1:hit"), stderr: Buffer.from("") };
		};
		const manager = fakeManager();
		const pi = mockPi();
		createSeatbeltExtension({ manager, runArgv, platform: "darwin" })(pi as never);
		await (pi.handlers.session_start as Function)({}, sessionCtx);
		const grep = pi.tools.find((t) => t.name === "grep");
		assert.ok(grep, "grep tool registered");
		await grep.execute("id", { pattern: "hit" }, undefined, () => {});
		assert.ok(
			argvLog.some((argv) => argv[0] === "rg"),
			`expected rg via helper, got ${JSON.stringify(argvLog)}`,
		);
	});

	it("find glob goes through the helper", async () => {
		const argvLog: string[][] = [];
		const runArgv = async (argv: readonly string[]) => {
			argvLog.push([...argv]);
			if (argv[0] === "test") {
				return { exitCode: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
			}
			return { exitCode: 0, stdout: Buffer.from("src/index.ts\n"), stderr: Buffer.from("") };
		};
		const ops = createSandboxedFindOps(runArgv);
		const results = await ops.glob("*.ts", process.cwd(), {
			ignore: ["**/node_modules/**"],
			limit: 10,
		});
		assert.ok(argvLog.some((argv) => argv[0] === "fd"));
		assert.ok(results.includes("src/index.ts"));
	});

	it("grep/find implementation files never spawn rg/fd unsandboxed", () => {
		const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
		const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
		const searchFiles = files.filter((f) => /search|grep|find/i.test(f));
		assert.ok(searchFiles.length > 0, "expected grep/find implementation files");
		for (const file of searchFiles) {
			const src = readFileSync(path.join(srcDir, file), "utf8");
			assert.doesNotMatch(src, /\bspawn\s*\(/, `${file} must not call spawn(`);
			assert.doesNotMatch(src, /child_process/, `${file} must not import child_process`);
		}
	});

	it("session_shutdown calls SandboxManager.reset when initialized", async () => {
		const manager = fakeManager();
		const pi = mockPi();
		createSeatbeltExtension({ manager, platform: "darwin" })(pi as never);
		await (pi.handlers.session_start as Function)({}, sessionCtx);
		await (pi.handlers.session_shutdown as Function)();
		assert.equal(manager.resetCalls, 1);
	});

	it("executeSandboxedGrep uses the helper for rg", async () => {
		const argvLog: string[][] = [];
		await executeSandboxedGrep(
			{ pattern: "foo" },
			{
				cwd: process.cwd(),
				runArgv: async (argv) => {
					argvLog.push([...argv]);
					return { exitCode: 1, stdout: Buffer.from(""), stderr: Buffer.from("") };
				},
			},
		);
		assert.equal(argvLog[0][0], "rg");
	});
});
