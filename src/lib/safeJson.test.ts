import { describe, expect, it } from "vitest";
import { safeParseJson } from "./safeJson";
import { robloxGameSpecSchema } from "./schemas";

describe("safeParseJson", () => {
	it("returns parsed data for valid JSON", () => {
		const result = safeParseJson(
			JSON.stringify({
				title: "Mall Hang",
				experienceType: "hangout",
				fantasy: "teen mallcore social vibes",
				coreLoop: "meet up and emote together",
				socialLoop: "players invite friends into shared poses",
				progressionHook: "unlock new hangout props",
				serverAuthoritativeRules: ["server validates rewards"],
				clientFeedback: ["show clear proximity prompts"],
				worldObjects: [
					{
						name: "Dance Floor",
						purpose: "Shared social hotspot",
						placement: "Center plaza",
					},
				],
				acceptanceTests: ["players can find a social interaction quickly"],
			}),
			robloxGameSpecSchema,
		);

		expect(result?.title).toBe("Mall Hang");
	});

	it("returns null for malformed JSON", () => {
		expect(safeParseJson("{", robloxGameSpecSchema)).toBeNull();
	});

	it("returns null for schema mismatches", () => {
		expect(
			safeParseJson('{"title":"Missing fields"}', robloxGameSpecSchema),
		).toBeNull();
	});
});
