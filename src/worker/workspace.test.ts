import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
	createRunWorkspace,
	loadArtifactBundle,
	writeSpecToWorkspace,
} from "./workspace";

describe("workspace helpers", () => {
	const generationId = "workspace-test";
	const runDir = path.join(process.cwd(), ".context/runs", generationId);

	afterEach(async () => {
		await rm(runDir, { force: true, recursive: true });
	});

	it("creates a run workspace from the fixed template", async () => {
		const { workspaceDir } = await createRunWorkspace(generationId);
		const bundle = await loadArtifactBundle(workspaceDir);

		expect(
			bundle.files.some((file) => file.path === "default.project.json"),
		).toBe(true);
	});

	it("writes the Roblox spec into the editable GameSpec file", async () => {
		const { workspaceDir } = await createRunWorkspace(generationId);
		await writeSpecToWorkspace(workspaceDir, {
			title: "Stage Hang",
			experienceType: "hangout",
			fantasy: "friends dance on a stage",
			coreLoop: "gather and emote",
			socialLoop: "shared dance prompts",
			progressionHook: "unlock lights",
			serverAuthoritativeRules: ["server owns rewards"],
			clientFeedback: ["show prompts"],
			worldObjects: [{ name: "Stage", purpose: "dance", placement: "center" }],
			acceptanceTests: ["players see the fantasy quickly"],
		});

		const bundle = await loadArtifactBundle(workspaceDir);
		const specFile = bundle.files.find(
			(file) => file.path === "src/shared/GameSpec.json",
		);
		expect(specFile?.content).toContain("Stage Hang");
	});

	it("rejects generation ids that attempt path traversal", async () => {
		await expect(createRunWorkspace("../..")).rejects.toThrow(
			"generationId must use only letters, numbers, dots, underscores, or hyphens.",
		);
	});

	it("rejects nested generation ids", async () => {
		await expect(createRunWorkspace("nested/child")).rejects.toThrow(
			"generationId must use only letters, numbers, dots, underscores, or hyphens.",
		);
	});
});
