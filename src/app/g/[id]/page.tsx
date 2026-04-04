"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use, useState } from "react";
import {
	formatFailureStage,
	STATUS_COLORS,
	STATUS_LABELS,
} from "@/lib/generationStatus";
import { safeParseJson } from "@/lib/safeJson";
import {
	gameSpecSchema,
	interactionEvalResultSchema,
	judgeEvalResultSchema,
	runtimeEvalResultSchema,
} from "@/lib/schemas";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";


export default function GenerationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const generation = useQuery(api.generations.getGeneration, {
		generationId: id as Id<"generations">,
	});

	const [showSpec, setShowSpec] = useState(false);
	const [showCode, setShowCode] = useState(false);

	if (generation === undefined) {
		return (
			<div className="min-h-screen p-8 max-w-6xl mx-auto">
				<p className="text-gray-500">Loading...</p>
			</div>
		);
	}

	if (generation === null) {
		return (
			<div className="min-h-screen p-8 max-w-6xl mx-auto">
				<p className="text-red-400">Generation not found.</p>
				<Link href="/" className="text-blue-400 hover:underline mt-4 block">
					Back to home
				</Link>
			</div>
		);
	}

	const spec = safeParseJson(generation.spec, gameSpecSchema);
	const failureStage = formatFailureStage(generation.failureStage);

	return (
		<div className="min-h-screen p-8 max-w-6xl mx-auto">
			<div className="flex items-center gap-4 mb-6">
				<Link href="/" className="text-gray-400 hover:text-white">
					&larr; Back
				</Link>
				<h1 className="text-2xl font-bold">
					&ldquo;{generation.prompt}&rdquo;
				</h1>
				<span
					className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[generation.status]}`}
				>
					{STATUS_LABELS[generation.status]}
				</span>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				<div className="lg:col-span-2">
					{generation.html ? (
						<div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
							<div className="p-3 border-b border-gray-800 flex items-center justify-between">
								<span className="text-sm text-gray-400">
									{spec?.title || "Game"} — click the game then use arrow keys
								</span>
							</div>
							<iframe
								srcDoc={generation.html}
								className="w-full"
								style={{ height: "660px" }}
								sandbox="allow-scripts"
								title="Generated game"
							/>
						</div>
					) : (
						<div className="bg-gray-900 border border-gray-800 rounded-lg p-12 flex items-center justify-center">
							<p className="text-gray-500">
								{generation.status === "failed"
									? "Generation failed"
									: "Game is being generated..."}
							</p>
						</div>
					)}
				</div>

				<div className="space-y-4">
					{spec && (
						<div className="bg-gray-900 border border-gray-800 rounded-lg">
							<button
								type="button"
								onClick={() => setShowSpec(!showSpec)}
								className="w-full p-3 flex items-center justify-between text-left
                           hover:bg-gray-800 rounded-lg transition-colors"
							>
								<span className="font-medium">Game Spec</span>
								<span className="text-gray-500">{showSpec ? "−" : "+"}</span>
							</button>
							{showSpec && (
								<div className="p-3 pt-0">
									<div className="text-sm space-y-2">
										<div>
											<span className="text-gray-500">Title:</span> {spec.title}
										</div>
										<div>
											<span className="text-gray-500">Genre:</span> {spec.genre}
										</div>
										<div>
											<span className="text-gray-500">Theme:</span> {spec.theme}
										</div>
										<div>
											<span className="text-gray-500">Core Loop:</span>{" "}
											{spec.coreLoop}
										</div>
										<div>
											<span className="text-gray-500">Win:</span>{" "}
											{spec.winCondition}
										</div>
										<div>
											<span className="text-gray-500">Lose:</span>{" "}
											{spec.loseCondition}
										</div>
										<div>
											<span className="text-gray-500">Score Rule:</span>{" "}
											{spec.scoreRule}
										</div>
										<div>
											<span className="text-gray-500">Entities:</span>{" "}
											{spec.entities
												.map((entity) => `${entity.name} (${entity.role})`)
												.join(", ")}
										</div>
									</div>
								</div>
							)}
						</div>
					)}

					{generation.evalRuns.length > 0 && (
						<div className="bg-gray-900 border border-gray-800 rounded-lg p-3">
							<h3 className="font-medium mb-3">Eval Results</h3>
							<div className="space-y-2">
								{generation.evalRuns.map((evalRun) => {
									const runtimeResult =
										evalRun.type === "runtime"
											? safeParseJson(evalRun.result, runtimeEvalResultSchema)
											: null;
									const interactionResult =
										evalRun.type === "interaction"
											? safeParseJson(
													evalRun.result,
													interactionEvalResultSchema,
												)
											: null;
									const judgeResult =
										evalRun.type === "judge"
											? safeParseJson(evalRun.result, judgeEvalResultSchema)
											: null;


									return (
										<div
											key={evalRun._id}
											className="text-sm border border-gray-700 rounded p-2"
										>
											<div className="flex items-center justify-between mb-1">
												<span className="capitalize font-medium">
													{evalRun.type}
												</span>
												<span
													className={
														evalRun.status === "done"
															? "text-green-400"
															: evalRun.status === "failed"
																? "text-red-400"
																: "text-yellow-400"
													}
												>
													{evalRun.status}
												</span>
											</div>
											{runtimeResult && (
												<span
													className={
														runtimeResult.pass
															? "text-green-400"
															: "text-red-400"
													}
												>
													{runtimeResult.pass ? "PASS" : "FAIL"}
													{runtimeResult.errors.length > 0 &&
														` (${runtimeResult.errors.length} errors)`}
												</span>
											)}
											{interactionResult && (
												<span
													className={
														interactionResult.pass
															? "text-green-400"
															: "text-red-400"
													}
												>
													{interactionResult.pass ? "PASS" : "FAIL"} &middot;{" "}
													{interactionResult.framesObserved} frames
												</span>
											)}
											{judgeResult && (
												<div className="text-xs text-gray-400 space-y-1">
													<div>
														Genre: {judgeResult.genreMatch}/5 &middot; Mechanic:{" "}
														{judgeResult.mechanicMatch}/5 &middot; Controls:{" "}
														{judgeResult.controlsMatch}/5
													</div>
													<div>{judgeResult.summary}</div>
												</div>
											)}
										</div>
									);
								})}
							</div>

							{generation.summaryScore !== undefined && (
								<div className="mt-3 pt-3 border-t border-gray-700 text-center">
									<span className="text-yellow-400 text-xl font-bold">
										{generation.summaryScore}/100
									</span>
									<span className="text-gray-500 text-sm block">
										Summary Score
									</span>
								</div>
							)}
						</div>
					)}

					{generation.mechanicCode && (
						<div className="bg-gray-900 border border-gray-800 rounded-lg">
							<button
								type="button"
								onClick={() => setShowCode(!showCode)}
								className="w-full p-3 flex items-center justify-between text-left
                           hover:bg-gray-800 rounded-lg transition-colors"
							>
								<span className="font-medium">Mechanic Code</span>
								<span className="text-gray-500">{showCode ? "−" : "+"}</span>
							</button>
							{showCode && (
								<pre className="p-3 pt-0 text-xs text-gray-300 overflow-x-auto max-h-96 overflow-y-auto">
									{generation.mechanicCode}
								</pre>
							)}
						</div>
					)}

					{generation.error && (
						<div className="bg-red-950 border border-red-800 rounded-lg p-3">
							<h3 className="font-medium text-red-400 mb-1">Error</h3>
							{failureStage && (
								<p className="text-xs text-red-400 mb-2">
									Failed during {failureStage}.
								</p>
							)}
							<p className="text-sm text-red-300">{generation.error}</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
