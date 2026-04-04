import { runAllEvals } from "@/evals/runEvals";
import { evalSuiteResultSchema, evalWorkerRequestSchema } from "@/lib/schemas";

export const runtime = "nodejs";

export async function POST(request: Request) {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		return Response.json(
			{ error: "OPENROUTER_API_KEY not configured on the eval worker" },
			{ status: 500 },
		);
	}

	try {
		const body = await request.json();
		const payload = evalWorkerRequestSchema.parse(body);
		const result = await runAllEvals(
			apiKey,
			payload.prompt,
			payload.spec,
			payload.mechanicCode,
			payload.html,
		);

		return Response.json(evalSuiteResultSchema.parse(result));
	} catch (error) {
		const message =
			error instanceof Error ? error.message : "Unknown eval error";
		return Response.json({ error: message }, { status: 400 });
	}
}
