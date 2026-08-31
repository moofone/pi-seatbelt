import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { describe, it } from "node:test";
import {
	runSandboxedArgv,
	runSandboxedBash,
	type SandboxSpawn,
	type SandboxWrapManager,
} from "../src/sandbox-exec.ts";

function fakeManager(opts: { rejectWrap?: boolean } = {}): SandboxWrapManager & {
	wrapCalls: string[];
	wrapArgvCalls: string[];
} {
	const wrapCalls: string[] = [];
	const wrapArgvCalls: string[] = [];
	return {
		wrapCalls,
		wrapArgvCalls,
		async wrapWithSandbox(command: string) {
			wrapCalls.push(command);
			if (opts.rejectWrap) throw new Error("wrap failed");
			return `WRAPPED:${command}`;
		},
		async wrapWithSandboxArgv(command: string) {
			wrapArgvCalls.push(command);
			if (opts.rejectWrap) throw new Error("wrap failed");
			return { argv: ["wrapped-bin", command], env: { ...process.env } };
		},
	};
}

function fakeSpawn(spawnCalls: Array<{ command: string; args: readonly string[] }>): SandboxSpawn {
	return (command, args) => {
		spawnCalls.push({ command, args: [...args] });
		const child = new EventEmitter() as EventEmitter & {
			pid: number;
			stdout: EventEmitter;
			stderr: EventEmitter;
			stdin: { write: () => void; end: () => void };
			kill: () => boolean;
		};
		child.pid = 4242;
		child.stdout = new EventEmitter();
		child.stderr = new EventEmitter();
		child.stdin = { write() {}, end() {} };
		child.kill = () => true;
		queueMicrotask(() => {
			child.stdout.emit("data", Buffer.from("hi\n"));
			child.emit("close", 0);
		});
		return child;
	};
}

describe("runSandboxedArgv", () => {
	it("calls wrapWithSandboxArgv and spawns the wrapped argv, not echo", async () => {
		const manager = fakeManager();
		const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
		const result = await runSandboxedArgv(["/bin/echo", "hi"], {
			manager,
			spawn: fakeSpawn(spawnCalls),
		});
		assert.equal(manager.wrapArgvCalls.length, 1);
		assert.equal(manager.wrapCalls.length, 0);
		assert.equal(spawnCalls.length, 1);
		assert.equal(spawnCalls[0].command, "wrapped-bin");
		assert.notEqual(spawnCalls[0].command, "/bin/echo");
		assert.notEqual(spawnCalls[0].command, "echo");
		assert.equal(result.exitCode, 0);
		assert.equal(result.stdout.toString(), "hi\n");
	});

	it("rejects and does not spawn when wrapWithSandboxArgv fails", async () => {
		const manager = fakeManager({ rejectWrap: true });
		const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
		await assert.rejects(
			() =>
				runSandboxedArgv(["/bin/echo", "hi"], {
					manager,
					spawn: fakeSpawn(spawnCalls),
				}),
			/wrap failed/,
		);
		assert.equal(spawnCalls.length, 0);
	});
});

describe("runSandboxedBash", () => {
	it("calls wrapWithSandbox and spawns bash -c with the wrapped command", async () => {
		const manager = fakeManager();
		const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
		await runSandboxedBash("echo hi", {
			manager,
			spawn: fakeSpawn(spawnCalls),
		});
		assert.deepEqual(manager.wrapCalls, ["echo hi"]);
		assert.equal(manager.wrapArgvCalls.length, 0);
		assert.equal(spawnCalls.length, 1);
		assert.equal(spawnCalls[0].command, "bash");
		assert.deepEqual(spawnCalls[0].args, ["-c", "WRAPPED:echo hi"]);
	});

	it("rejects and does not spawn when wrapWithSandbox fails", async () => {
		const manager = fakeManager({ rejectWrap: true });
		const spawnCalls: Array<{ command: string; args: readonly string[] }> = [];
		await assert.rejects(
			() =>
				runSandboxedBash("echo hi", {
					manager,
					spawn: fakeSpawn(spawnCalls),
				}),
			/wrap failed/,
		);
		assert.equal(spawnCalls.length, 0);
	});
});
