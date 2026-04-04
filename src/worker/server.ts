import type { ServerResponse } from "node:http";
import { createServer } from "node:http";

const DEFAULT_PORT = 3200;

function sendJson(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, { "Content-Type": "application/json" });
	response.end(JSON.stringify(body));
}

export function startWorkerServer(
	port = Number(process.env.HARNESS_WORKER_PORT ?? DEFAULT_PORT),
) {
	const server = createServer((request, response) => {
		if (request.method === "POST" && request.url === "/runs/generate") {
			sendJson(response, 501, {
				error: "Generate handler not implemented yet.",
			});
			return;
		}

		if (request.method === "POST" && request.url === "/runs/evaluate") {
			sendJson(response, 501, {
				error: "Evaluate handler not implemented yet.",
			});
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
