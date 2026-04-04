import {
	beforeEach,
	describe,
	expect,
	it,
	type MockInstance,
	vi,
} from "vitest";
import type { GameSpec } from "@/types";

vi.mock("@/lib/openrouter", () => ({
	chatCompletion: vi.fn(),
	extractJSON: vi.fn((text: string) => text.trim()),
}));

import { chatCompletion } from "@/lib/openrouter";
import { buildMechanic } from "./buildMechanic";

const mockSpec: GameSpec = {
	title: "Space Dodge",
	genre: "dodge",
	theme: "space",
	playerGoal: "Avoid asteroids",
	controls: ["ArrowLeft", "ArrowRight"],
	entities: [{ name: "ship", role: "player" }],
	coreLoop: "Dodge asteroids",
	winCondition: "Survive 60s",
	loseCondition: "Hit asteroid",
	scoreRule: "+1 per second",
	visualStyle: "Neon shapes",
	acceptanceTests: ["Player moves"],
};

const validMechanicCode = `
function initMechanic(state) {
  state.player = { x: 400, y: 500, w: 30, h: 30 };
  state.entities = [];
}

function updateMechanic(state, input) {
  if (input.keys.ArrowLeft) state.player.x -= 4;
  if (input.keys.ArrowRight) state.player.x += 4;
  state.tick++;
}

function renderMechanic(ctx, state) {
  ctx.fillStyle = "#0ff";
  ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);
}`;

describe("buildMechanic", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns valid mechanic code with all 3 functions", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			validMechanicCode,
		);
		const result = await buildMechanic("fake-key", mockSpec);
		expect(result).toContain("function initMechanic");
		expect(result).toContain("function updateMechanic");
		expect(result).toContain("function renderMechanic");
	});

	it("strips markdown code fences from response", async () => {
		const wrapped = `\`\`\`javascript\n${validMechanicCode}\n\`\`\``;
		(chatCompletion as unknown as MockInstance).mockResolvedValue(wrapped);
		const result = await buildMechanic("fake-key", mockSpec);
		expect(result).not.toContain("```");
		expect(result).toContain("function initMechanic");
	});

	it("throws when initMechanic is missing", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			"function updateMechanic(state, input) {}\nfunction renderMechanic(ctx, state) {}",
		);
		await expect(buildMechanic("fake-key", mockSpec)).rejects.toThrow(
			"missing initMechanic",
		);
	});

	it("throws when updateMechanic is missing", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			"function initMechanic(state) {}\nfunction renderMechanic(ctx, state) {}",
		);
		await expect(buildMechanic("fake-key", mockSpec)).rejects.toThrow(
			"missing updateMechanic",
		);
	});

	it("throws when renderMechanic is missing", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			"function initMechanic(state) {}\nfunction updateMechanic(state, input) {}",
		);
		await expect(buildMechanic("fake-key", mockSpec)).rejects.toThrow(
			"missing renderMechanic",
		);
	});

	it("uses low temperature for code generation", async () => {
		(chatCompletion as unknown as MockInstance).mockResolvedValue(
			validMechanicCode,
		);
		await buildMechanic("fake-key", mockSpec);
		expect(chatCompletion).toHaveBeenCalledWith(
			"fake-key",
			expect.objectContaining({ temperature: 0.3 }),
		);
	});
});
