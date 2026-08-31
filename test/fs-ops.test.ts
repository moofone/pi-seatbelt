import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import {
	createSandboxedEditOps,
	createSandboxedLsOps,
	createSandboxedReadOps,
	createSandboxedWriteOps,
} from "../src/operations-fs.ts";

function recorder() {
	const argvLog: string[][] = [];
	const runArgv = async (argv: readonly string[]) => {
		argvLog.push([...argv]);
		if (argv[0] === "test") {
			return { exitCode: 0, stdout: Buffer.from(""), stderr: Buffer.from("") };
		}
		if (argv[0] === "ls") {
			return { exitCode: 0, stdout: Buffer.from("a\nb\n"), stderr: Buffer.from("") };
		}
		return { exitCode: 0, stdout: Buffer.from("ok"), stderr: Buffer.from("") };
	};
	return { argvLog, runArgv };
}

describe("sandboxed file operations", () => {
	it("readFile / writeFile / mkdir / readdir / stat / access call runSandboxedArgv", async () => {
		const { argvLog, runArgv } = recorder();
		const read = createSandboxedReadOps(runArgv);
		const write = createSandboxedWriteOps(runArgv);
		const edit = createSandboxedEditOps(runArgv);
		const ls = createSandboxedLsOps(runArgv);

		await read.readFile("/tmp/x");
		await write.writeFile("/tmp/y", "hi");
		await write.mkdir("/tmp/d");
		await ls.readdir("/tmp/d");
		await ls.stat("/tmp/d");
		await read.access("/tmp/x");
		await edit.access("/tmp/y");

		const bins = argvLog.map((argv) => argv[0]);
		assert.ok(bins.includes("cat"), `readFile argv: ${JSON.stringify(argvLog)}`);
		assert.ok(bins.includes("tee"), `writeFile argv: ${JSON.stringify(argvLog)}`);
		assert.ok(bins.includes("mkdir"), `mkdir argv: ${JSON.stringify(argvLog)}`);
		assert.ok(bins.includes("ls"), `readdir argv: ${JSON.stringify(argvLog)}`);
		assert.ok(bins.includes("test"), `stat/access argv: ${JSON.stringify(argvLog)}`);
		assert.ok(argvLog.some((argv) => argv.includes("/tmp/x")));
		assert.ok(argvLog.some((argv) => argv.includes("/tmp/y")));
	});

	it("does not use node:fs writeFile in operations-fs", () => {
		const srcPath = fileURLToPath(new URL("../src/operations-fs.ts", import.meta.url));
		const src = readFileSync(srcPath, "utf8");
		assert.doesNotMatch(src, /fs\.writeFile/);
		assert.doesNotMatch(src, /fs\.promises\.writeFile/);
		assert.doesNotMatch(src, /from ["']node:fs["']/);
		assert.doesNotMatch(src, /from ["']node:fs\/promises["']/);
		assert.ok(path.basename(srcPath) === "operations-fs.ts");
	});
});
