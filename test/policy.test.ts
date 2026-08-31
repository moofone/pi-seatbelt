import assert from "node:assert/strict";
import path from "node:path";
import { describe, it } from "node:test";
import { GIT_WRITE_ROOT, buildDefaultSeatbeltConfig } from "../src/policy.ts";

const HOME = "/Users/greg";

describe("buildDefaultSeatbeltConfig", () => {
	const cfg = buildDefaultSeatbeltConfig(HOME);
	const allowWrite = cfg.filesystem.allowWrite;
	const denyRead = cfg.filesystem.denyRead;

	it("allows writes under Dev/git and the tmp/cache grants", () => {
		const expected = [
			GIT_WRITE_ROOT,
			"/tmp",
			"/private/tmp",
			"/var/folders",
			path.join(HOME, "Library/Caches"),
			path.join(HOME, ".cache"),
			path.join(HOME, ".npm"),
			path.join(HOME, ".pnpm-store"),
			path.join(HOME, ".yarn"),
			path.join(HOME, ".cargo"),
			path.join(HOME, ".rustup"),
			path.join(HOME, ".local/share"),
		];
		for (const p of expected) {
			assert.ok(allowWrite.includes(p), `allowWrite missing ${p}`);
		}
		assert.equal(GIT_WRITE_ROOT, "/Users/greg/Dev/git");
	});

	it("does not allow writes to orchestrator, $home, or Documents", () => {
		assert.ok(!allowWrite.includes("/Users/greg/orchestrator"));
		assert.ok(!allowWrite.includes(HOME));
		assert.ok(!allowWrite.includes(path.join(HOME, "Documents")));
	});

	it("denies only credential reads", () => {
		assert.deepEqual(denyRead, [
			path.join(HOME, ".ssh"),
			path.join(HOME, ".aws"),
			path.join(HOME, ".gnupg"),
			path.join(HOME, ".netrc"),
			path.join(HOME, ".config/gh"),
		]);
	});

	it("does not deny grep binaries or ripgrep", () => {
		assert.ok(!denyRead.includes("/usr/bin/grep"));
		assert.ok(!denyRead.includes("/opt/homebrew/bin/rg"));
		assert.deepEqual(cfg.filesystem.denyWrite, []);
	});

	it("allows all network domains with local binding", () => {
		assert.deepEqual(cfg.network.allowedDomains, ["*"]);
		assert.equal(cfg.network.allowLocalBinding, true);
	});
});
