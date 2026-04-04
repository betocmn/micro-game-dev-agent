/**
 * Eval 1 — Runtime Sanity
 *
 * Did the game load and initialize without crashing?
 *
 * Loads the generated HTML in a headless browser (Playwright),
 * checks for JavaScript errors, and verifies the game reached
 * the ready state with a valid snapshot.
 *
 * This is the cheapest eval — just load and check. If this fails,
 * the other evals are skipped (hard fail).
 */

import { type Browser, chromium } from "playwright";
import type { RuntimeEvalResult } from "@/types";

export async function runRuntimeEval(html: string): Promise<RuntimeEvalResult> {
	let browser: Browser | null = null;
	const errors: string[] = [];
	let readySeen = false;
	let snapshot: Record<string, unknown> | null = null;

	try {
		browser = await chromium.launch({ headless: true });
		const page = await browser.newPage();

		// Collect JS errors
		page.on("pageerror", (err) => {
			errors.push(err.message);
		});

		// Watch console for GAME_READY
		page.on("console", (msg) => {
			if (msg.text() === "GAME_READY") {
				readySeen = true;
			}
		});

		// Load the game HTML
		await page.setContent(html, { waitUntil: "domcontentloaded" });

		// Wait for ready state (max 5 seconds)
		try {
			await page.waitForFunction(
				() =>
					(window as unknown as { __gameEval: { ready: boolean } }).__gameEval
						?.ready === true,
				{ timeout: 5000 },
			);
			readySeen = true;
		} catch {
			// Timeout — game didn't reach ready state
		}

		// Take snapshot if ready
		if (readySeen) {
			try {
				snapshot = await page.evaluate(() => {
					return (
						window as unknown as {
							__gameEval: { snapshot: () => Record<string, unknown> };
						}
					).__gameEval?.snapshot();
				});
			} catch {
				// Snapshot failed
			}
		}
	} finally {
		if (browser) await browser.close();
	}

	const pass = errors.length === 0 && readySeen && snapshot !== null;

	return { pass, errors, readySeen, snapshot };
}
