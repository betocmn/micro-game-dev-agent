import { afterEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, extractJSON } from "./openrouter";

describe("chatCompletion", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("forwards responseFormat and signal to OpenRouter", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"ok":true}' } }],
			}),
		});
		const controller = new AbortController();

		vi.stubGlobal("fetch", fetchMock);

		const result = await chatCompletion("test-key", {
			model: "openai/gpt-5-mini",
			messages: [{ role: "user", content: "Judge this" }],
			temperature: 0.2,
			maxTokens: 128,
			signal: controller.signal,
			responseFormat: { type: "json_object" },
		});

		expect(result).toBe('{"ok":true}');
		expect(fetchMock).toHaveBeenCalledOnce();
		const [url, options] = fetchMock.mock.calls[0];
		expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
		expect(options?.signal).toBe(controller.signal);
		expect(options?.headers).toMatchObject({
			Authorization: "Bearer test-key",
		});
		expect(JSON.parse(String(options?.body))).toMatchObject({
			model: "openai/gpt-5-mini",
			temperature: 0.2,
			max_tokens: 128,
			response_format: { type: "json_object" },
			messages: [{ role: "user", content: "Judge this" }],
		});
	});

	it("preserves default request behavior when optional fields are omitted", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: "plain text" } }],
			}),
		});

		vi.stubGlobal("fetch", fetchMock);

		await chatCompletion("test-key", {
			messages: [{ role: "system", content: "Hello" }],
		});

		const [, options] = fetchMock.mock.calls[0];
		expect(JSON.parse(String(options?.body))).toMatchObject({
			model: "anthropic/claude-sonnet-4",
			temperature: 0.7,
			max_tokens: 4096,
			messages: [{ role: "system", content: "Hello" }],
		});
		expect(JSON.parse(String(options?.body))).not.toHaveProperty(
			"response_format",
		);
		expect(options?.signal).toBeUndefined();
	});
});

describe("extractJSON", () => {
	it("extracts JSON from markdown code fence", () => {
		const input = '```json\n{"title": "Mall Hang"}\n```';
		expect(extractJSON(input)).toBe('{"title": "Mall Hang"}');
	});

	it("extracts JSON from plain code fence", () => {
		const input = '```\n{"title": "test"}\n```';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});

	it("returns trimmed text when no fences present", () => {
		const input = '  {"title": "test"}  ';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});

	it("handles multiline JSON inside fences", () => {
		const input =
			'```json\n{\n  "title": "Mall Hang",\n  "experienceType": "hangout"\n}\n```';
		const result = extractJSON(input);
		const parsed = JSON.parse(result);
		expect(parsed.title).toBe("Mall Hang");
		expect(parsed.experienceType).toBe("hangout");
	});

	it("handles text before and after fences", () => {
		const input = 'Here is the JSON:\n```json\n{"title": "test"}\n```\nDone!';
		expect(extractJSON(input)).toBe('{"title": "test"}');
	});
});
