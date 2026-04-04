import {
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import type { GameSpec } from "@/types";

// Mock the openrouter module before importing the agent
vi.mock("@/lib/openrouter", () => ({
	chatCompletion: vi.fn(),
	extractJSON: vi.fn((text: string) => {
		const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
		if (fenceMatch) return fenceMatch[1].trim();
		return text.trim();
	}),
}));

import { chatCompletion } from "@/lib/openrouter";
import { expandIntent } from "./expandIntent";

const validSpec: GameSpec = {
	title: "Space Dodge",
	genre: "dodge",
	theme: "space asteroids",
	playerGoal: "Avoid asteroids",
	controls: ["ArrowLeft", "ArrowRight"],
	entities: [
		{ name: "ship", role: "player" },
		{ name: "asteroid", role: "hazard" },
	],
	coreLoop: "Dodge asteroids that fall from the top",
	winCondition: "Survive for 60 seconds",
	loseCondition: "Hit an asteroid",
	scoreRule: "+1 per second survived",
	visualStyle: "Neon shapes on dark background",
	acceptanceTests: ["Player moves left/right", "Asteroids spawn from top"],
};

describe("expandIntent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("parses a valid LLM response into a GameSpec", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			JSON.stringify(validSpec),
		);
		const result = await expandIntent("fake-key", "space dodge rocks");
		expect(result.title).toBe("Space Dodge");
		expect(result.genre).toBe("dodge");
		expect(result.entities).toHaveLength(2);
	});

	it("throws on missing required fields", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			JSON.stringify({ theme: "space" }),
		);
		await expect(expandIntent("fake-key", "space dodge rocks")).rejects.toThrow(
			"Invalid GameSpec",
		);
	});

	it("throws on invalid JSON response", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			"not json at all",
		);
		await expect(
			expandIntent("fake-key", "space dodge rocks"),
		).rejects.toThrow();
	});

	it("passes the prompt to the LLM", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			JSON.stringify(validSpec),
		);
		await expandIntent("fake-key", "space dodge rocks");
		expect(chatCompletion).toHaveBeenCalledWith("fake-key", {
			messages: expect.arrayContaining([
				expect.objectContaining({
					role: "user",
					content: "space dodge rocks",
				}),
			]),
			temperature: 0.7,
			maxTokens: 1024,
		});
	});
});
