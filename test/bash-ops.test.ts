import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSandboxedBashOps } from "../src/operations-bash.ts";
import { createSeatbeltExtension, type SeatbeltManager } from "../src/index.ts";

function fakeManager(): SeatbeltManager & {
	calls: { initialize: number; reset: number; wrap: string[]; wrapArgv: string[] };
} {
	const calls = { initialize: 0, reset: 0, wrap: [] as string[], wrapArgv: [] as string[] };
	return {
		calls,
		async initialize() {
			calls.initialize++;
		},
		async reset() {
			calls.reset++;
		},
		async wrapWithSandbox(command: string) {
			calls.wrap.push(command);
			return command;
		},
		async wrapWithSandboxArgv(command: string) {
			calls.wrapArgv.push(command);
			return { argv: ["true"], env: { ...process.env } };
		},
	};
}

function mockPi(flags: Record<string, unknown> = {}) {
	const handlers: Record<string, (...args: unknown[]) => unknown> = {};
	const tools: Array<{ name?: string; execute?: Function }> = [];
	return {
		tools,
		handlers,
		registerFlag() {},
		getFlag(name: string) {
			return flags[name];
		},
		registerTool(tool: { name?: string }) {
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

describe("createSandboxedBashOps", () => {
	it("exec delegates to runSandboxedBash", async () => {
		const seen: string[] = [];
		const ops = createSandboxedBashOps({
			runBash: async (command) => {
				seen.push(command);
				return { exitCode: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
			},
		});
		const result = await ops.exec("true", process.cwd(), { onData() {} });
		assert.deepEqual(seen, ["true"]);
		assert.equal(result.exitCode, 0);
	});
});

describe("bash / user_bash lifecycle", () => {
	it("does not initialize or wrap when --no-sandbox", async () => {
		const manager = fakeManager();
		const pi = mockPi({ "no-sandbox": true });
		createSeatbeltExtension({ manager, platform: "darwin" })(pi as never);
		await (pi.handlers.session_start as Function)({}, sessionCtx);
		assert.equal(manager.calls.initialize, 0);
		const userBash = pi.handlers.user_bash as Function;
		assert.equal(userBash(), undefined);
		assert.equal(manager.calls.wrap.length, 0);
		assert.equal(manager.calls.wrapArgv.length, 0);
	});

	it("user_bash returns operations only after initialize", async () => {
		const manager = fakeManager();
		const pi = mockPi({ "no-sandbox": false });
		createSeatbeltExtension({ manager, platform: "darwin" })(pi as never);
		assert.equal((pi.handlers.user_bash as Function)(), undefined);
		await (pi.handlers.session_start as Function)({}, sessionCtx);
		assert.equal(manager.calls.initialize, 1);
		const result = (pi.handlers.user_bash as Function)();
		assert.ok(result?.operations?.exec);
	});
});
