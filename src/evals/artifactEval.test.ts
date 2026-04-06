import { describe, expect, it } from "vitest";
import type { ArtifactBundle } from "@/types";
import { runArtifactEval } from "./artifactEval";

const scaffoldChecksum = "fixed-checksum";

function createBundle(overrides: Partial<ArtifactBundle> = {}): ArtifactBundle {
	return {
		artifactType: "roblox-rojo",
		scaffoldVersion: "claude-rojo-v1",
		files: [
			{
				path: "default.project.json",
				content: "{}",
				editable: false,
				language: "json",
			},
			{
				path: "README.generated.md",
				content: "# readme",
				editable: false,
				language: "markdown",
			},
			{
				path: "src/client/Mechanic.client.luau",
				content: "function MechanicClient.start() end\nreturn MechanicClient",
				editable: true,
				language: "luau",
			},
			{
				path: "src/server/Mechanic.server.luau",
				content: "function MechanicServer.start() end\nreturn MechanicServer",
				editable: true,
				language: "luau",
			},
			{
				path: "src/shared/GameSpec.json",
				content: JSON.stringify({
					title: "Test",
					experienceType: "hangout",
					fantasy: "social plaza",
					coreLoop: "hang out",
					socialLoop: "group emotes",
					progressionHook: "earn style points",
					serverAuthoritativeRules: ["server owns rewards"],
					clientFeedback: ["show prompts"],
					worldObjects: [
						{ name: "Stage", purpose: "party", placement: "center" },
					],
					acceptanceTests: ["friends gather"],
				}),
				editable: true,
				language: "json",
			},
			{
				path: "src/shared/MechanicContract.luau",
				content: "return {}",
				editable: false,
				language: "luau",
			},
		],
		...overrides,
	};
}

describe("runArtifactEval", () => {
	it("reports missing required files", async () => {
		const baseBundle = createBundle();
		const result = await runArtifactEval(
			createBundle({
				files: baseBundle.files.filter(
					(file) => file.path !== "src/shared/MechanicContract.luau",
				),
			}),
			scaffoldChecksum,
		);

		expect(result.pass).toBe(false);
		expect(result.missingFiles).toContain("src/shared/MechanicContract.luau");
	});
});
