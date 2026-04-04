"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { use, useDeferredValue, useEffect, useState } from "react";
import {
	formatFailureStage,
	STATUS_COLORS,
	STATUS_LABELS,
} from "@/lib/generationStatus";
import { safeParseJson } from "@/lib/safeJson";
import {
	artifactBundleSchema,
	artifactEvalResultSchema,
	robloxEvalResultSchema,
	robloxGameSpecSchema,
	robloxJudgeEvalResultSchema,
} from "@/lib/schemas";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

function formatUsd(value: number | undefined) {
	if (value === undefined) {
		return "n/a";
	}

	return `$${value.toFixed(3)}`;
}

export default function GenerationPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const { id } = use(params);
	const generation = useQuery(api.generations.getGeneration, {
		generationId: id as Id<"generations">,
	});
	const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
	const spec = generation
		? safeParseJson(generation.spec, robloxGameSpecSchema)
		: null;
	const artifactBundle = generation
		? safeParseJson(generation.artifactBundle, artifactBundleSchema)
		: null;
	const failureStage = formatFailureStage(generation?.failureStage);
	const latestAgentRun = generation
		? generation.latestAgentRunId !== undefined
			? generation.agentRuns.find(
					(agentRun) => agentRun._id === generation.latestAgentRunId,
				)
			: generation.agentRuns[generation.agentRuns.length - 1]
		: null;

	useEffect(() => {
		if (artifactBundle?.files.length && selectedFilePath === null) {
			setSelectedFilePath(artifactBundle.files[0].path);
		}
	}, [artifactBundle, selectedFilePath]);

	const deferredSelectedFilePath = useDeferredValue(selectedFilePath);
	const selectedFile =
		artifactBundle?.files.find(
			(file) => file.path === deferredSelectedFilePath,
		) ??
		artifactBundle?.files[0] ??
		null;

	const parsedEvalRuns =
		generation?.evalRuns.map((evalRun) => ({
			evalRun,
			artifact:
				evalRun.type === "artifact"
					? safeParseJson(evalRun.result, artifactEvalResultSchema)
					: null,
			roblox:
				evalRun.type === "roblox"
					? safeParseJson(evalRun.result, robloxEvalResultSchema)
					: null,
			judge:
				evalRun.type === "judge"
					? safeParseJson(evalRun.result, robloxJudgeEvalResultSchema)
					: null,
		})) ?? [];

	if (generation === undefined) {
		return (
			<div className="min-h-screen p-8 max-w-7xl mx-auto">
				<p className="text-gray-500">Loading...</p>
			</div>
		);
	}

	if (generation === null) {
		return (
			<div className="min-h-screen p-8 max-w-7xl mx-auto">
				<p className="text-red-400">Generation not found.</p>
				<Link href="/" className="mt-4 block text-blue-400 hover:underline">
					Back to home
				</Link>
			</div>
		);
	}

	return (
		<div className="min-h-screen p-8 max-w-7xl mx-auto">
			<div className="mb-6 flex flex-wrap items-center gap-4">
				<Link href="/" className="text-gray-400 hover:text-white">
					&larr; Back
				</Link>
				<h1 className="text-2xl font-bold text-white">
					&ldquo;{generation.prompt}&rdquo;
				</h1>
				<span
					className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[generation.status]}`}
				>
					{STATUS_LABELS[generation.status]}
				</span>
				{generation.harnessVersion && (
					<span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
						{generation.harnessVersion}
					</span>
				)}
				{generation.evalProfile && (
					<span className="rounded-full border border-gray-700 px-3 py-1 text-xs text-gray-300">
						{generation.evalProfile}
					</span>
				)}
			</div>

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_340px]">
				<div className="space-y-6">
					<div className="rounded-2xl border border-gray-800 bg-gray-950">
						<div className="border-b border-gray-800 p-4">
							<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
								Artifact Bundle
							</h2>
							<p className="mt-1 text-sm text-gray-500">
								Fixed Rojo scaffold plus agent-authored Luau files.
							</p>
						</div>

						{artifactBundle ? (
							<div className="grid gap-0 md:grid-cols-[260px_minmax(0,1fr)]">
								<div className="border-r border-gray-800 bg-gray-900/60 p-3">
									<div className="space-y-2">
										{artifactBundle.files.map((file) => (
											<button
												key={file.path}
												type="button"
												onClick={() => setSelectedFilePath(file.path)}
												className={`w-full rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
													selectedFile?.path === file.path
														? "border-sky-500 bg-sky-950/60 text-white"
														: "border-gray-800 bg-gray-950 text-gray-300 hover:border-gray-600"
												}`}
											>
												<div className="font-medium">{file.path}</div>
												<div className="mt-1 text-xs text-gray-500">
													{file.editable ? "editable" : "fixed"} &middot;{" "}
													{file.language}
												</div>
											</button>
										))}
									</div>
								</div>

								<div className="min-h-[520px] p-4">
									{selectedFile ? (
										<>
											<div className="mb-3 flex items-center justify-between text-xs text-gray-500">
												<span>{selectedFile.path}</span>
												<span>
													{selectedFile.editable
														? "Agent-authored"
														: "Template file"}
												</span>
											</div>
											<pre className="overflow-x-auto rounded-xl bg-black/40 p-4 text-xs text-gray-200">
												{selectedFile.content}
											</pre>
										</>
									) : (
										<div className="flex h-full items-center justify-center text-gray-500">
											Select a file to inspect the artifact.
										</div>
									)}
								</div>
							</div>
						) : (
							<div className="p-12 text-center text-gray-500">
								{generation.status === "failed"
									? "Artifact generation failed."
									: "The Anthropic worker is still materializing the scaffold."}
							</div>
						)}
					</div>

					<div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
						<div className="mb-4 flex items-center justify-between">
							<h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
								Trace Summary
							</h2>
							<span className="text-xs text-gray-500">
								{generation.agentEvents.length} events
							</span>
						</div>

						{generation.agentEvents.length > 0 ? (
							<div className="space-y-3">
								{generation.agentEvents.map((event) => (
									<div
										key={event._id}
										className="rounded-xl border border-gray-800 bg-gray-900/40 p-3"
									>
										<div className="mb-1 text-xs uppercase tracking-[0.2em] text-gray-500">
											{event.type}
										</div>
										<div className="text-sm text-gray-200">{event.summary}</div>
										{event.payload && (
											<pre className="mt-2 overflow-x-auto rounded bg-black/30 p-2 text-xs text-gray-400">
												{event.payload}
											</pre>
										)}
									</div>
								))}
							</div>
						) : (
							<p className="text-sm text-gray-500">
								Worker trace events will appear here after the first agent run.
							</p>
						)}
					</div>
				</div>

				<div className="space-y-6">
					{spec && (
						<div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
							<h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
								Roblox Spec
							</h2>
							<div className="space-y-3 text-sm text-gray-300">
								<div>
									<span className="text-gray-500">Title:</span> {spec.title}
								</div>
								<div>
									<span className="text-gray-500">Type:</span>{" "}
									{spec.experienceType}
								</div>
								<div>
									<span className="text-gray-500">Fantasy:</span> {spec.fantasy}
								</div>
								<div>
									<span className="text-gray-500">Social loop:</span>{" "}
									{spec.socialLoop}
								</div>
								<div>
									<span className="text-gray-500">Progression:</span>{" "}
									{spec.progressionHook}
								</div>
								<div>
									<span className="text-gray-500">World objects:</span>{" "}
									{spec.worldObjects
										.map((worldObject) => worldObject.name)
										.join(", ")}
								</div>
							</div>
						</div>
					)}

					<div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
						<h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
							Latest Agent Run
						</h2>
						{latestAgentRun ? (
							<div className="space-y-3 text-sm text-gray-300">
								<div>
									<span className="text-gray-500">Session:</span>{" "}
									{latestAgentRun.sessionId}
								</div>
								<div>
									<span className="text-gray-500">Model:</span>{" "}
									{latestAgentRun.model}
								</div>
								<div>
									<span className="text-gray-500">Turns:</span>{" "}
									{latestAgentRun.numTurns}
								</div>
								<div>
									<span className="text-gray-500">Cost:</span>{" "}
									{formatUsd(latestAgentRun.totalCostUsd)}
								</div>
								<div>
									<span className="text-gray-500">Stop reason:</span>{" "}
									{latestAgentRun.stopReason ?? "n/a"}
								</div>
								{latestAgentRun.permissionDenials.length > 0 && (
									<div>
										<span className="text-gray-500">Permission denials:</span>{" "}
										{latestAgentRun.permissionDenials.join("; ")}
									</div>
								)}
							</div>
						) : (
							<p className="text-sm text-gray-500">
								No agent session has been persisted yet.
							</p>
						)}
					</div>

					<div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
						<h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
							Eval Results
						</h2>
						<div className="space-y-3">
							{parsedEvalRuns.map(({ evalRun, artifact, roblox, judge }) => (
								<div
									key={evalRun._id}
									className="rounded-xl border border-gray-800 bg-gray-900/40 p-3 text-sm text-gray-300"
								>
									<div className="mb-2 flex items-center justify-between">
										<span className="font-medium capitalize text-white">
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

									{artifact && (
										<div className="space-y-1 text-xs text-gray-400">
											<div>
												Artifact: {artifact.pass ? "PASS" : "FAIL"} &middot;
												Schema: {artifact.schemaValid ? "valid" : "invalid"}
											</div>
											{artifact.notes.map((note) => (
												<div key={note}>{note}</div>
											))}
										</div>
									)}

									{roblox && (
										<div className="space-y-1 text-xs text-gray-400">
											<div>
												Roblox: {roblox.pass ? "PASS" : "FAIL"} &middot; Social
												signals: {roblox.socialSignals.join(", ") || "none"}
											</div>
											{roblox.notes.map((note) => (
												<div key={note}>{note}</div>
											))}
										</div>
									)}

									{judge && (
										<div className="space-y-1 text-xs text-gray-400">
											<div>
												Fit {judge.robloxFit}/5 &middot; Fidelity{" "}
												{judge.promptFidelity}/5 &middot; Social{" "}
												{judge.socialLoopQuality}/5 &middot; Clarity{" "}
												{judge.clarity}/5
											</div>
											<div>{judge.summary}</div>
										</div>
									)}
								</div>
							))}
						</div>

						{generation.summaryScore !== undefined && (
							<div className="mt-4 rounded-xl border border-yellow-800 bg-yellow-950/20 p-3 text-center">
								<div className="text-2xl font-bold text-yellow-300">
									{generation.summaryScore}/100
								</div>
								<div className="text-xs uppercase tracking-[0.2em] text-yellow-500">
									Benchmark Score
								</div>
							</div>
						)}
					</div>

					{generation.error && (
						<div className="rounded-2xl border border-red-800 bg-red-950/40 p-4">
							<h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-red-300">
								Error
							</h2>
							{failureStage && (
								<p className="mb-2 text-xs text-red-400">
									Failed during {failureStage}.
								</p>
							)}
							<p className="text-sm text-red-200">{generation.error}</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
