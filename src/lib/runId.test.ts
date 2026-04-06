import path from "node:path";
import { describe, expect, it } from "vitest";
import { isPathWithinDirectory } from "./runId";

describe("isPathWithinDirectory", () => {
	const workspaceDir = path.join("/tmp", "workspace");

	it("accepts the workspace root and children", () => {
		expect(isPathWithinDirectory(workspaceDir, workspaceDir)).toBe(true);
		expect(
			isPathWithinDirectory(
				workspaceDir,
				path.join(workspaceDir, "src/server/Mechanic.server.luau"),
			),
		).toBe(true);
	});

	it("rejects sibling prefixes that only share the same string prefix", () => {
		expect(
			isPathWithinDirectory(
				workspaceDir,
				path.join("/tmp", "workspace2", "src/server/Mechanic.server.luau"),
			),
		).toBe(false);
	});
});
