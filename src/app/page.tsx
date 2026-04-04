"use client";

import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";
import { api } from "../../convex/_generated/api";

const STATUS_COLORS: Record<string, string> = {
	queued: "bg-gray-600",
	expanding: "bg-blue-600 animate-pulse",
	building: "bg-purple-600 animate-pulse",
	compiling: "bg-indigo-600 animate-pulse",
	evaluating: "bg-yellow-600 animate-pulse",
	done: "bg-green-600",
	failed: "bg-red-600",
};

const STATUS_LABELS: Record<string, string> = {
	queued: "Queued",
	expanding: "Expanding intent...",
	building: "Building mechanic...",
	compiling: "Compiling game...",
	evaluating: "Running evals...",
	done: "Done",
	failed: "Failed",
};

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
		<div className="min-h-screen p-8 max-w-4xl mx-auto">
			{/* Header */}
			<div className="mb-8">
				<h1 className="text-3xl font-bold mb-2">3 Words to Game</h1>
				<p className="text-gray-400">
					Type a vague prompt. An agent chain interprets your intent, generates
					a playable HTML5 canvas game, and evals score it automatically.
				</p>
			</div>

			{/* Prompt input */}
			<form onSubmit={handleSubmit} className="mb-10">
				<div className="flex gap-3">
					<input
						type="text"
						value={prompt}
						onChange={(e) => setPrompt(e.target.value)}
						placeholder='Try "space dodge rocks" or "collect coins forest"'
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

			{/* Generations list */}
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

				{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
				{generations?.map((gen: any) => {
					const spec = gen.spec ? JSON.parse(gen.spec) : null;

					return (
						<Link
							key={gen._id}
							href={`/g/${gen._id}`}
							className="block p-4 bg-gray-900 border border-gray-800 rounded-lg
                         hover:border-gray-600 transition-colors"
						>
							<div className="flex items-center justify-between mb-2">
								<span className="text-lg font-medium">
									&ldquo;{gen.prompt}&rdquo;
								</span>
								<span
									className={`px-3 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[gen.status]}`}
								>
									{STATUS_LABELS[gen.status]}
								</span>
							</div>

							{spec && (
								<div className="text-sm text-gray-400">
									<span className="text-gray-300">{spec.title}</span>
									{" — "}
									{spec.genre} &middot; {spec.coreLoop}
								</div>
							)}

							{gen.status === "done" && gen.summaryScore !== undefined && (
								<div className="mt-2 flex gap-4 text-xs">
									<span
										className={
											gen.runtimePass ? "text-green-400" : "text-red-400"
										}
									>
										Runtime: {gen.runtimePass ? "PASS" : "FAIL"}
									</span>
									<span
										className={
											gen.interactionPass ? "text-green-400" : "text-red-400"
										}
									>
										Interaction: {gen.interactionPass ? "PASS" : "FAIL"}
									</span>
									{gen.judgeScore !== undefined && (
										<span className="text-blue-400">
											Judge: {gen.judgeScore}/100
										</span>
									)}
									<span className="text-yellow-400 font-medium">
										Score: {gen.summaryScore}/100
									</span>
								</div>
							)}

							{gen.status === "failed" && gen.error && (
								<p className="mt-2 text-xs text-red-400 truncate">
									Error: {gen.error}
								</p>
							)}
						</Link>
					);
				})}
			</div>
		</div>
	);
}
