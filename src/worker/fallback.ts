import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { RobloxExperienceType, RobloxGameSpec } from "@/types";

function titleCase(text: string) {
	return text
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word[0]?.toUpperCase() + word.slice(1).toLowerCase())
		.join(" ");
}

function inferExperienceType(prompt: string): RobloxExperienceType {
	const normalized = prompt.toLowerCase();
	if (normalized.includes("obby")) return "obby";
	if (
		normalized.includes("cafe") ||
		normalized.includes("fashion") ||
		normalized.includes("pet")
	) {
		return "social-sim";
	}
	if (normalized.includes("arcade") || normalized.includes("minigame")) {
		return "minigame";
	}
	if (normalized.includes("tycoon")) return "tycoon-lite";
	return "hangout";
}

function buildTitle(prompt: string, experienceType: RobloxExperienceType) {
	const base = titleCase(prompt);
	switch (experienceType) {
		case "obby":
			return `${base} Obby`;
		case "social-sim":
			return `${base} Social Club`;
		case "minigame":
			return `${base} Party Zone`;
		case "tycoon-lite":
			return `${base} Tycoon Lite`;
		default:
			return `${base} Hangout`;
	}
}

export function deriveRobloxSpecFromPrompt(prompt: string): RobloxGameSpec {
	const experienceType = inferExperienceType(prompt);

	return {
		title: buildTitle(prompt, experienceType),
		experienceType,
		fantasy: `A teen-friendly Roblox ${experienceType} inspired by "${prompt}" where players immediately understand the vibe and stay near friends.`,
		coreLoop:
			"Move through the main space, trigger short interactions, earn lightweight progression, and return to shared hotspots.",
		socialLoop:
			"Players benefit from staying near friends through shared prompts, visible reactions, and small co-op bonuses.",
		progressionHook:
			"Earn social tokens from group activities to unlock cosmetic upgrades and access to a more expressive hangout area.",
		serverAuthoritativeRules: [
			"Server validates rewards, unlocks, and shared interaction state.",
			"Server checks proximity before awarding any co-op bonus.",
			"Server owns the persistent progression counters for every player.",
		],
		clientFeedback: [
			"Show clear prompts when players approach the main interaction hotspots.",
			"Celebrate co-op progress with lightweight UI and particle feedback.",
			"Surface progression status without interrupting the social loop.",
		],
		worldObjects: [
			{
				name: "Central Hangout Spot",
				purpose: "Primary social gathering point and reaction hotspot",
				placement: "center",
			},
			{
				name: "Activity Corner",
				purpose: "Shared loop interaction that awards progression",
				placement: "side wing",
			},
			{
				name: "Unlock Zone",
				purpose: "Visible progression payoff area for returning players",
				placement: "upper area",
			},
		],
		acceptanceTests: [
			"Players understand the fantasy and social goal within the first 10 seconds.",
			"At least one rewarding interaction clearly works better with another nearby player.",
			"Progression is visible and motivating without overshadowing the hangout loop.",
		],
	};
}

function renderServerScript(spec: RobloxGameSpec) {
	return `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local MechanicContract = require(Shared:WaitForChild("MechanicContract"))

local remoteEvent = ReplicatedStorage:FindFirstChild(MechanicContract.remoteEventName)
if not remoteEvent then
\tremoteEvent = Instance.new("RemoteEvent")
\tremoteEvent.Name = MechanicContract.remoteEventName
\tremoteEvent.Parent = ReplicatedStorage
end

local MechanicServer = {}
local playerState = {}

local function ensurePlayerState(player)
\tif playerState[player] then
\t\treturn playerState[player]
\tend

\tplayerState[player] = {
\t\trewards = 0,
\t\tlastInteractionTick = 0,
\t}
\treturn playerState[player]
end

local function awardReward(player, amount, reason)
\tlocal state = ensurePlayerState(player)
\tstate.rewards += amount
\tremoteEvent:FireClient(player, {
\t\tkind = "reward",
\t\tamount = amount,
\t\treason = reason,
\t\ttotal = state.rewards,
\t})
end

function MechanicServer.start()
\tPlayers.PlayerAdded:Connect(ensurePlayerState)
\tPlayers.PlayerRemoving:Connect(function(player)
\t\tplayerState[player] = nil
\tend)

\tremoteEvent.OnServerEvent:Connect(function(player, payload)
\t\tif typeof(payload) ~= "table" then
\t\t\treturn
\t\tend

\t\tlocal state = ensurePlayerState(player)
\t\tlocal now = os.clock()
\t\tif now - state.lastInteractionTick < 2 then
\t\t\treturn
\t\tend

\t\tstate.lastInteractionTick = now
\t\tawardReward(player, payload.groupBonus and 10 or 5, payload.reason or "social-loop")
\tend)

\treturn {
\t\tstatus = "ready",
\t\tcontractVersion = MechanicContract.version,
\t\texperienceTitle = "${spec.title}",
\t\tprimaryLoop = "${spec.socialLoop}",
\t}
end

return MechanicServer
`;
}

function renderClientScript(spec: RobloxGameSpec) {
	const prompt = spec.clientFeedback[0] ?? "Stay near friends to earn rewards.";
	return `local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local player = Players.LocalPlayer
local Shared = ReplicatedStorage:WaitForChild("Shared")
local MechanicContract = require(Shared:WaitForChild("MechanicContract"))
local remoteEvent = ReplicatedStorage:WaitForChild(MechanicContract.remoteEventName)

local MechanicClient = {}
local localState = {
\tlastPrompt = "${prompt}",
\trewards = 0,
}

local function sendSocialPulse(reason, groupBonus)
\tremoteEvent:FireServer({
\t\treason = reason,
\t\tgroupBonus = groupBonus,
\t})
end

function MechanicClient.start()
\tremoteEvent.OnClientEvent:Connect(function(payload)
\t\tif typeof(payload) ~= "table" then
\t\t\treturn
\t\tend

\t\tif payload.kind == "reward" then
\t\t\tlocalState.rewards = payload.total or localState.rewards
\t\t\tlocalState.lastPrompt = "${prompt}"
\t\tend
\tend)

\ttask.delay(1, function()
\t\tsendSocialPulse("initial-social-loop", false)
\tend)

\treturn {
\t\tstatus = "ready",
\t\tcontractVersion = MechanicContract.version,
\t\tprompt = localState.lastPrompt,
\t\tplayerName = player.Name,
\t}
end

return MechanicClient
`;
}

export async function materializeFallbackProject(
	workspaceDir: string,
	spec: RobloxGameSpec,
): Promise<void> {
	await writeFile(
		path.join(workspaceDir, "src/shared/GameSpec.json"),
		`${JSON.stringify(spec, null, 2)}\n`,
		"utf8",
	);
	await writeFile(
		path.join(workspaceDir, "src/server/Mechanic.server.luau"),
		renderServerScript(spec),
		"utf8",
	);
	await writeFile(
		path.join(workspaceDir, "src/client/Mechanic.client.luau"),
		renderClientScript(spec),
		"utf8",
	);
}
