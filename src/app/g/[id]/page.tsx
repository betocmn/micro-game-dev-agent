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

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function formatTraceTimestamp(timestamp: number) {
	return new Intl.DateTimeFormat("en-US", {
		hour: "numeric",
		minute: "2-digit",
		second: "2-digit",
	}).format(new Date(timestamp));
}

function formatTraceLabel(value: string) {
	return value
		.split(/[_-]+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() + part.slice(1))
		.join(" ");
}

function parseTracePayload(payload: string | undefined): unknown | null {
	if (!payload) {
		return null;
	}

	try {
		return JSON.parse(payload);
	} catch {
		return null;
	}
}

function stringifyTraceValue(value: unknown): string {
	if (typeof value === "string") {
		return value;
	}

	const serialized = JSON.stringify(value, null, 2);
	return serialized ?? String(value);
}

function formatRawTracePayload(
	payload: string | undefined,
	parsedPayload: unknown | null,
) {
	if (!payload) {
		return null;
	}

	if (parsedPayload !== null) {
		return JSON.stringify(parsedPayload, null, 2);
	}

	return payload;
}

function extractTraceSectionsFromContent(content: unknown) {
	if (!Array.isArray(content)) {
		return [];
	}

	return content.flatMap((block, index) => {
		if (!isRecord(block)) {
			return [
				{
					label: `Content ${index + 1}`,
					body: stringifyTraceValue(block),
				},
			];
		}

		if (typeof block.text === "string" && block.text.trim().length > 0) {
			return [{ label: "Assistant Text", body: block.text }];
		}

		if (
			typeof block.thinking === "string" &&
			block.thinking.trim().length > 0
		) {
			return [{ label: "Thinking", body: block.thinking }];
		}

		if (block.type === "redacted_thinking") {
			return [{ label: "Thinking", body: "[redacted by provider]" }];
		}

		if (typeof block.name === "string") {
			return [
				{
					label: `Tool Call ${block.name}`,
					body:
						"input" in block
							? stringifyTraceValue(block.input)
							: "No tool input provided.",
				},
			];
		}

		if ("content" in block) {
			return [
				{
					label:
						typeof block.type === "string"
							? formatTraceLabel(block.type)
							: `Content ${index + 1}`,
					body: stringifyTraceValue(block.content),
				},
			];
		}

		return [
			{
				label:
					typeof block.type === "string"
						? formatTraceLabel(block.type)
						: `Content ${index + 1}`,
				body: stringifyTraceValue(block),
			},
		];
	});
}

function extractTraceSections(payload: unknown) {
	if (!isRecord(payload)) {
		return [];
	}

	if (payload.type === "assistant") {
		const message = isRecord(payload.message) ? payload.message : null;
		return extractTraceSectionsFromContent(message?.content);
	}

	if (payload.type === "result") {
		const sections: Array<{ label: string; body: string }> = [];
		if (
			typeof payload.result === "string" &&
			payload.result.trim().length > 0
		) {
			sections.push({ label: "Result", body: payload.result });
		}
		if (
			"structured_output" in payload &&
			payload.structured_output !== undefined
		) {
			sections.push({
				label: "Structured Output",
				body: stringifyTraceValue(payload.structured_output),
			});
		}
		if (
			Array.isArray(payload.permission_denials) &&
			payload.permission_denials.length > 0
		) {
			sections.push({
				label: "Permission Denials",
				body: stringifyTraceValue(payload.permission_denials),
			});
		}
		return sections;
	}

	if (
		payload.type === "tool_use_summary" &&
		typeof payload.summary === "string"
	) {
		return [{ label: "Tool Summary", body: payload.summary }];
	}

	if (payload.type === "tool_progress") {
		return [
			{
				label: "Tool Progress",
				body: `${String(payload.tool_name ?? "Tool")} running for ${String(
					payload.elapsed_time_seconds ?? "?",
				)}s`,
			},
		];
	}

	if (payload.type === "system") {
		switch (payload.subtype) {
			case "init":
				return [
					{
						label: "Session Setup",
						body: [
							`Model: ${String(payload.model ?? "n/a")}`,
							`CWD: ${String(payload.cwd ?? "n/a")}`,
							`Tools: ${Array.isArray(payload.tools) ? payload.tools.join(", ") : "n/a"}`,
						].join("\n"),
					},
				];
			case "task_started":
				return payload.prompt
					? [{ label: "Task Prompt", body: String(payload.prompt) }]
					: [];
			case "task_progress":
				return [
					{
						label: "Usage",
						body: stringifyTraceValue(payload.usage),
					},
				];
			case "task_notification":
				return payload.usage
					? [
							{
								label: "Usage",
								body: stringifyTraceValue(payload.usage),
							},
						]
					: [];
			case "local_command_output":
				return typeof payload.content === "string"
					? [{ label: "Command Output", body: payload.content }]
					: [];
			case "api_retry":
				return [
					{
						label: "Retry Details",
						body: [
							`Attempt: ${String(payload.attempt ?? "n/a")}/${String(payload.max_retries ?? "n/a")}`,
							`Error: ${String(payload.error ?? "unknown")}`,
							`Delay: ${String(payload.retry_delay_ms ?? "n/a")}ms`,
						].join("\n"),
					},
				];
			case "hook_progress":
			case "hook_response":
				return [
					{
						label: "Hook Output",
						body: [
							typeof payload.output === "string" ? payload.output : "",
							typeof payload.stdout === "string" ? payload.stdout : "",
							typeof payload.stderr === "string" ? payload.stderr : "",
						]
							.filter(Boolean)
							.join("\n\n"),
					},
				].filter((section) => section.body.length > 0);
			case "files_persisted":
				return [
					{
						label: "Persisted Files",
						body: stringifyTraceValue(payload.files),
					},
				];
			default:
				return [];
		}
	}

	if (payload.type === "auth_status") {
		return Array.isArray(payload.output)
			? [{ label: "Auth Output", body: payload.output.join("\n") }]
			: [];
	}

	if (payload.type === "prompt_suggestion") {
		return typeof payload.suggestion === "string"
			? [{ label: "Prompt Suggestion", body: payload.suggestion }]
			: [];
	}

	return [];
}

function getTraceSubtype(payload: unknown) {
	if (!isRecord(payload) || typeof payload.subtype !== "string") {
		return null;
	}

	return formatTraceLabel(payload.subtype);
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

			<div className="grid gap-6 xl:grid-cols-[minmax(0,1.9fr)_minmax(0,340px)]">
				<div className="min-w-0 space-y-6">
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
												<div className="break-all font-medium">{file.path}</div>
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
								Trace Logs
							</h2>
							<span className="text-xs text-gray-500">
								{generation.agentEvents.length} events
							</span>
						</div>

						{generation.agentEvents.length > 0 ? (
							<div className="space-y-3">
								{generation.agentEvents.map((event) => {
									const parsedPayload = parseTracePayload(event.payload);
									const traceSections = extractTraceSections(
										parsedPayload,
									).filter(
										(section) => section.body.trim() !== event.summary.trim(),
									);
									const rawTracePayload = formatRawTracePayload(
										event.payload,
										parsedPayload,
									);
									const traceSubtype = getTraceSubtype(parsedPayload);

									return (
										<div
											key={event._id}
											className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40"
										>
											<div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-800 px-3 py-2">
												<div className="flex flex-wrap items-center gap-2">
													<div className="text-xs uppercase tracking-[0.2em] text-gray-500">
														{event.type}
													</div>
													{traceSubtype && (
														<span className="rounded-full border border-gray-700 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] text-gray-400">
															{traceSubtype}
														</span>
													)}
												</div>
												<div className="text-[11px] text-gray-600">
													{formatTraceTimestamp(event._creationTime)}
												</div>
											</div>

											<div className="space-y-3 p-3">
												<div className="whitespace-pre-wrap break-words text-sm text-gray-100">
													{event.summary}
												</div>

												{traceSections.map((section) => (
													<div
														key={`${event._id}-${section.label}-${section.body.slice(0, 48)}`}
													>
														<div className="mb-1 text-[11px] uppercase tracking-[0.2em] text-gray-500">
															{section.label}
														</div>
														<pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded bg-black/30 p-3 text-xs text-gray-300">
															{section.body}
														</pre>
													</div>
												))}

												{rawTracePayload && (
													<details className="rounded-lg border border-gray-800 bg-black/20">
														<summary className="cursor-pointer px-3 py-2 text-[11px] uppercase tracking-[0.2em] text-gray-500">
															Raw event JSON
														</summary>
														<pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words border-t border-gray-800 p-3 text-xs text-gray-400">
															{rawTracePayload}
														</pre>
													</details>
												)}
											</div>
										</div>
									);
								})}
							</div>
						) : (
							<p className="text-sm text-gray-500">
								Worker trace events will appear here after the first agent run.
							</p>
						)}
					</div>
				</div>

				<div className="min-w-0 space-y-6">
					{spec && (
						<div className="rounded-2xl border border-gray-800 bg-gray-950 p-4">
							<h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-gray-400">
								Roblox Spec
							</h2>
							<div className="space-y-3 break-words text-sm text-gray-300">
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
							<div className="space-y-3 break-all text-sm text-gray-300">
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
									className="overflow-hidden rounded-xl border border-gray-800 bg-gray-900/40 p-3 text-sm text-gray-300"
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
											<div className="break-words">{judge.summary}</div>
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
