"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import {
	formatFailureStage,
	STATUS_COLORS,
	STATUS_LABELS,
} from "@/lib/generationStatus";
import { safeParseJson } from "@/lib/safeJson";
import { artifactBundleSchema, robloxGameSpecSchema } from "@/lib/schemas";
import { api } from "../../convex/_generated/api";

export default function Home() {
	const [prompt, setPrompt] = useState("");
	const generations = useQuery(api.generations.listGenerations);
	const enqueue = useMutation(api.generations.enqueueGeneration);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!prompt.trim()) return;
		await enqueue({ prompt: prompt.trim() });
		setPrompt("");
	};

	return (
		<div className="min-h-screen p-8 max-w-5xl mx-auto">
			<div className="mb-8 space-y-3">
				<div className="inline-flex items-center rounded-full border border-sky-800 bg-sky-950 px-3 py-1 text-xs uppercase tracking-[0.2em] text-sky-300">
					Anthropic-native Roblox harness
				</div>
				<h1 className="text-4xl font-bold text-white">
					Vague prompt to Rojo scaffold
				</h1>
				<p className="text-gray-400">
					Type a vague teen-style prompt. The worker expands intent into a
					Roblox-ready project bundle, stores the artifact in Convex, and scores
					it with proxy evals.
				</p>
			</div>

			<form onSubmit={handleSubmit} className="mb-10">
				<div className="flex gap-3">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder='Try "mall hang vibes" or "cute cafe drama"'
						className="flex-1 px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg
                       text-white placeholder-gray-500 focus:outline-none focus:border-blue-500
                       focus:ring-1 focus:ring-blue-500"
					/>
					<button
						type="submit"
						disabled={!prompt.trim()}
						className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700
                       disabled:cursor-not-allowed rounded-lg font-medium transition-colors"
					>
						Generate
					</button>
				</div>
			</form>

			<div className="space-y-4">
				<h2 className="text-lg font-semibold text-gray-300">Generations</h2>

				{generations === undefined && (
					<p className="text-gray-500">Loading...</p>
				)}

				{generations?.length === 0 && (
					<p className="text-gray-500">
						No generations yet. Type a prompt above to get started.
					</p>
				)}

				{generations?.map((generation) => {
					const spec = safeParseJson(generation.spec, robloxGameSpecSchema);
					const artifactBundle = safeParseJson(
						generation.artifactBundle,
						artifactBundleSchema,
					);
					const failureStage = formatFailureStage(generation.failureStage);

					return (
						<Link
							key={generation._id}
							href={`/g/${generation._id}`}
							className="block p-5 bg-gray-900 border border-gray-800 rounded-2xl
                         hover:border-gray-600 transition-colors"
						>
							<div className="flex items-center justify-between gap-4 mb-3">
								<span className="text-lg font-medium text-white">
									&ldquo;{generation.prompt}&rdquo;
								</span>
								<span
									className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[generation.status]}`}
								>
									{STATUS_LABELS[generation.status]}
								</span>
							</div>

							{spec && (
								<div className="space-y-2 text-sm text-gray-400">
									<div>
										<span className="text-gray-200">{spec.title}</span>
										{" — "}
										{spec.experienceType} &middot; {spec.socialLoop}
									</div>
									<div className="flex flex-wrap gap-2 text-xs">
										<span className="rounded-full bg-gray-800 px-2 py-1 text-gray-300">
											{artifactBundle?.files.length ?? 0} files
										</span>
										{generation.harnessVersion && (
											<span className="rounded-full bg-gray-800 px-2 py-1 text-gray-300">
												{generation.harnessVersion}
											</span>
										)}
										{generation.evalProfile && (
											<span className="rounded-full bg-gray-800 px-2 py-1 text-gray-300">
												{generation.evalProfile}
											</span>
										)}
									</div>
								</div>
							)}

							{generation.status === "done" &&
								generation.summaryScore !== undefined && (
									<div className="mt-3 flex flex-wrap gap-4 text-xs">
										<span
											className={
												generation.artifactPass
													? "text-green-400"
													: "text-red-400"
											}
										>
											Artifact: {generation.artifactPass ? "PASS" : "FAIL"}
										</span>
										<span
											className={
												generation.robloxPass
													? "text-green-400"
													: "text-red-400"
											}
										>
											Roblox: {generation.robloxPass ? "PASS" : "FAIL"}
										</span>
										{generation.judgeScore !== undefined && (
											<span className="text-blue-400">
												Judge: {generation.judgeScore}/100
											</span>
										)}
										<span className="text-yellow-400 font-medium">
											Score: {generation.summaryScore}/100
										</span>
									</div>
								)}

							{generation.status === "failed" && generation.error && (
								<div className="mt-2 space-y-1 text-xs text-red-400">
									{failureStage && <p>Stage: {failureStage}</p>}
									<p className="truncate">Error: {generation.error}</p>
								</div>
							)}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
