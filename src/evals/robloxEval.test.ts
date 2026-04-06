import { describe, expect, it } from "vitest";
import type { ArtifactBundle, RobloxGameSpec } from "@/types";
import { runRobloxEval } from "./robloxEval";

const spec: RobloxGameSpec = {
	title: "Mall Hang",
	experienceType: "hangout",
	fantasy: "Mall friends",
	coreLoop: "meet and show off",
	socialLoop: "players dance together",
	progressionHook: "earn style tokens",
	serverAuthoritativeRules: ["server owns rewards"],
	clientFeedback: ["show group prompts"],
	worldObjects: [{ name: "Stage", purpose: "party", placement: "center" }],
	acceptanceTests: ["players can find a social interaction quickly"],
};

const artifactBundle: ArtifactBundle = {
	artifactType: "roblox-rojo",
	scaffoldVersion: "claude-rojo-v1",
	files: [
		{
			path: "src/server/Mechanic.server.luau",
			content:
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal MechanicServer = {}\nlocal RemoteEvent = Instance.new("RemoteEvent")\nfunction MechanicServer.start() return RemoteEvent end\nreturn MechanicServer',
			editable: true,
			language: "luau",
		},
		{
			path: "src/client/Mechanic.client.luau",
			content:
				'local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal MechanicClient = {}\nfunction MechanicClient.start() print("friend hangout") end\nreturn MechanicClient',
			editable: true,
			language: "luau",
		},
		{
			path: "src/shared/MechanicContract.luau",
			content: 'return { remoteEventName = "SocialLoopEvent" }',
			editable: false,
			language: "luau",
		},
	],
};

describe("runRobloxEval", () => {
	it("passes for a social scaffold with server/client separation", async () => {
		const result = await runRobloxEval("mall hang vibes", spec, artifactBundle);

		expect(result.pass).toBe(true);
		expect(result.socialSignals.length).toBeGreaterThan(0);
	});

	it("fails when banned APIs are present", async () => {
		const result = await runRobloxEval("mall hang vibes", spec, {
			...artifactBundle,
			files: artifactBundle.files.map((file) =>
				file.path === "src/server/Mechanic.server.luau"
					? {
							...file,
							content: `${file.content}\nHttpService:GetAsync("https://bad")`,
						}
					: file,
			),
		});

		expect(result.pass).toBe(false);
		expect(result.bannedApis).toContain("HttpService:GetAsync");
	});

	it("fails when the Luau files contain no social-loop behavior", async () => {
		const result = await runRobloxEval("mall hang vibes", spec, {
			...artifactBundle,
			files: artifactBundle.files.map((file) => {
				if (file.path === "src/server/Mechanic.server.luau") {
					return {
						...file,
						content:
							'local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal MechanicServer = {}\nfunction MechanicServer.start() return { status = "ready" } end\nreturn MechanicServer',
					};
				}

				if (file.path === "src/client/Mechanic.client.luau") {
					return {
						...file,
						content:
							'local ReplicatedStorage = game:GetService("ReplicatedStorage")\nlocal MechanicClient = {}\nfunction MechanicClient.start() return { status = "ready" } end\nreturn MechanicClient',
					};
				}

				return file;
			}),
		});

		expect(result.pass).toBe(false);
		expect(result.socialSignals).toHaveLength(0);
		expect(result.notes).toContain(
			"No clear social-loop signals detected in the artifact.",
		);
	});
});
