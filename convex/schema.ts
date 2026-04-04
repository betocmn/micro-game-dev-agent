/**
 * Convex schema — defines the two tables that power the app.
 *
 * "generations" tracks each prompt → game pipeline run.
 * "evalRuns" stores individual eval results linked to a generation.
 *
 * Convex is schema-first: you define your tables here and get
 * type-safe queries/mutations automatically. Think of it like
 * Prisma but the database is also your real-time subscription layer.
 */

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  generations: defineTable({
    prompt: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("expanding"),
      v.literal("building"),
      v.literal("compiling"),
      v.literal("evaluating"),
      v.literal("done"),
      v.literal("failed")
    ),
    spec: v.optional(v.string()), // JSON stringified GameSpec
    mechanicCode: v.optional(v.string()),
    html: v.optional(v.string()),
    summaryScore: v.optional(v.float64()),
    runtimePass: v.optional(v.boolean()),
    interactionPass: v.optional(v.boolean()),
    judgeScore: v.optional(v.float64()),
    error: v.optional(v.string()),
  }),

  evalRuns: defineTable({
    generationId: v.id("generations"),
    type: v.union(
      v.literal("runtime"),
      v.literal("interaction"),
      v.literal("judge")
    ),
    status: v.union(
      v.literal("queued"),
      v.literal("running"),
      v.literal("done"),
      v.literal("failed")
    ),
    result: v.optional(v.string()), // JSON stringified eval result
  }).index("by_generation", ["generationId"]),
});
