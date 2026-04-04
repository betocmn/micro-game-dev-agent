/**
 * Eval 2 — Interaction Survival
 *
 * Does the game behave under input, not just compile?
 *
 * Simulates keyboard input for 12 seconds using Playwright:
 * - Left arrow for 1s
 * - Right arrow for 1s
 * - Random arrow mashing for 10s
 *
 * Samples the game snapshot every second and checks that:
 * - The tick counter increased (game loop is running)
 * - State changed (something is happening)
 * - Score changed (game is tracking progress)
 * - No crashes during the 12s window
 *
 * This catches the subtle bugs that runtime eval misses:
 * physics that technically work but nothing moves, or collision
 * detection that passes unit tests but never fires in practice.
 */

import { type Browser, chromium, type Page } from "playwright";
import type { InteractionEvalResult } from "@/types";

interface GameSnapshot {
	tick: number;
	score: number;
	running: boolean;
	player: Record<string, unknown>;
	entities: unknown[];
}

async function getSnapshot(page: Page): Promise<GameSnapshot | null> {
	try {
		return await page.evaluate(() => {
			return (
				window as unknown as { __gameEval: { snapshot: () => GameSnapshot } }
			).__gameEval?.snapshot();
		});
	} catch {
		return null;
	}
}

const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export async function runInteractionEval(
	html: string,
): Promise<InteractionEvalResult> {
	let browser: Browser | null = null;
	const snapshots: GameSnapshot[] = [];
	let crashed = false;
	const startTime = Date.now();

	try {
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();

		page.on("pageerror", () => {
			crashed = true;
		});

		await page.setContent(html, { waitUntil: "domcontentloaded" });

		// Wait for game to be ready
		try {
			await page.waitForFunction(
				() =>
					(window as unknown as { __gameEval: { ready: boolean } }).__gameEval
						?.ready === true,
				{ timeout: 5000 },
			);
		} catch {
			return {
				pass: false,
				durationMs: Date.now() - startTime,
				framesObserved: 0,
				stateChanged: false,
				scoreChanged: false,
				crashed: true,
			};
		}

		// Take initial snapshot
		const initial = await getSnapshot(page);
		if (initial) snapshots.push(initial);

		// Phase 1: Left arrow for 1s
		await page.keyboard.down("ArrowLeft");
		await page.waitForTimeout(1000);
		await page.keyboard.up("ArrowLeft");
		const snap1 = await getSnapshot(page);
		if (snap1) snapshots.push(snap1);

		// Phase 2: Right arrow for 1s
		await page.keyboard.down("ArrowRight");
		await page.waitForTimeout(1000);
		await page.keyboard.up("ArrowRight");
		const snap2 = await getSnapshot(page);
		if (snap2) snapshots.push(snap2);

		// Phase 3: Random arrow mashing for 10s, snapshot every second
		for (let i = 0; i < 10; i++) {
			// Press a random arrow key
			const key = ARROW_KEYS[Math.floor(Math.random() * ARROW_KEYS.length)];
			await page.keyboard.press(key);

			// Small burst of rapid keypresses
			for (let j = 0; j < 5; j++) {
				const burstKey =
					ARROW_KEYS[Math.floor(Math.random() * ARROW_KEYS.length)];
				await page.keyboard.press(burstKey);
			}

			await page.waitForTimeout(900);
			const snap = await getSnapshot(page);
			if (snap) snapshots.push(snap);

			// Check if game ended (running = false means player lost, which is valid)
			if (snap && !snap.running) break;
			if (crashed) break;
		}
	} finally {
		if (browser) await browser.close();
	}

	const durationMs = Date.now() - startTime;
	const framesObserved = snapshots.length;

	// Analyze snapshots
	let stateChanged = false;
	let scoreChanged = false;

	if (snapshots.length >= 2) {
		const first = snapshots[0];
		const last = snapshots[snapshots.length - 1];

		// Tick should have increased
		stateChanged = last.tick > first.tick;

		// Score should have changed (either increased or game ended)
		scoreChanged = last.score !== first.score;

		// If player position changed, that counts as state changed too
		if (JSON.stringify(first.player) !== JSON.stringify(last.player)) {
			stateChanged = true;
		}
	}

	const pass = !crashed && framesObserved >= 3 && stateChanged;

	return {
		pass,
		durationMs,
		framesObserved,
		stateChanged,
		scoreChanged,
		crashed,
	};
}
