import { describe, expect, it } from "vitest";
import { safeParseJson } from "./safeJson";
import { gameSpecSchema } from "./schemas";

describe("safeParseJson", () => {
	it("returns parsed data for valid JSON", () => {
		const result = safeParseJson(
			JSON.stringify({
				title: "Space Dodge",
				genre: "dodge",
				theme: "space",
				playerGoal: "survive",
				controls: ["ArrowLeft", "ArrowRight"],
				entities: [{ name: "ship", role: "player" }],
				coreLoop: "dodge asteroids",
				winCondition: "last long enough",
				loseCondition: "get hit",
				scoreRule: "+1 per second",
				visualStyle: "neon",
				acceptanceTests: ["player can move"],
			}),
			gameSpecSchema,
		);

		expect(result?.title).toBe("Space Dodge");
	});

	it("returns null for malformed JSON", () => {
		expect(safeParseJson("{", gameSpecSchema)).toBeNull();
	});

	it("returns null for schema mismatches", () => {
		expect(
			safeParseJson('{"title":"Missing fields"}', gameSpecSchema),
		).toBeNull();
	});
});
