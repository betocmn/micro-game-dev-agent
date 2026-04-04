import type { ServerResponse } from "node:http";
import { createServer } from "node:http";
import { runRobloxEvals } from "@/evals/robloxRunEvals";
import { ensureLocalEnvLoaded } from "@/lib/loadEnv";
import {
	evaluateRunRequestSchema,
	evaluateRunResponseSchema,
	generateRunRequestSchema,
} from "@/lib/schemas";
import { generateRobloxRun } from "./harness";
import { getFixedScaffoldChecksum, getTemplateBundle } from "./workspace";

ensureLocalEnvLoaded();

const DEFAULT_PORT = 3200;

function sendJson(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, { "Content-Type": "application/json" });
	response.end(JSON.stringify(body));
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
	const chunks: Buffer[] = [];
	for await (const chunk of request) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const body = Buffer.concat(chunks).toString("utf8");
	return body.length > 0 ? JSON.parse(body) : {};
}

export function startWorkerServer(
	port = Number(process.env.HARNESS_WORKER_PORT ?? DEFAULT_PORT),
) {
	const server = createServer(async (request, response) => {
		if (request.method === "POST" && request.url === "/runs/generate") {
			try {
				const body = await readJsonBody(request);
				const payload = generateRunRequestSchema.parse(body);
				const result = await generateRobloxRun(payload);
				sendJson(response, 200, result);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown generation error";
				sendJson(response, 400, { error: message });
			}
			return;
		}

		if (request.method === "POST" && request.url === "/runs/evaluate") {
			try {
				const body = await readJsonBody(request);
				const payload = evaluateRunRequestSchema.parse(body);
				const apiKey = process.env.ANTHROPIC_API_KEY;
				if (!apiKey) {
					throw new Error(
						"ANTHROPIC_API_KEY is not configured for the harness worker.",
					);
				}
				const templateBundle = await getTemplateBundle();
				const evalSuite = await runRobloxEvals(
					apiKey,
					payload.prompt,
					payload.spec,
					payload.artifactBundle,
					getFixedScaffoldChecksum(templateBundle),
				);
				sendJson(
					response,
					200,
					evaluateRunResponseSchema.parse({
						evalSuite,
					}),
				);
			} catch (error) {
				const message =
					error instanceof Error ? error.message : "Unknown evaluation error";
				sendJson(response, 400, { error: message });
			}
			return;
		}

		sendJson(response, 404, { error: "Not found" });
	});

	server.listen(port, "127.0.0.1", () => {
		console.log(`Harness worker listening on http://127.0.0.1:${port}`);
	});

	return server;
}

startWorkerServer();
