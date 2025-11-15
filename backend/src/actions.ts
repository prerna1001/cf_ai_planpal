// ==============================
// File: backend/src/actions.ts
// ==============================

import type { Env } from "./types";

/**
 * Called when user confirms a plan that should be saved.
 * This function saves the plan into their memory under the title.
 */
export async function create_plan(
  args: any,
  memory: any,
  env: Env
): Promise<{ message: string; updateContext?: object }> {
  const {
    title,
    destination,
    type = "trip",
    days,
    budget,
    itinerary = [],
    preferences = [],
  } = args;

  // Validate input
  if (!title || !destination || !days || !budget || !Array.isArray(itinerary)) {
    return {
      message:
        "❌ Sorry, the plan couldn't be saved because some important details are missing.",
    };
  }

  // Normalize title key
  const key = title.toLowerCase().replace(/\s+/g, "_");

  // Ensure context and plans object exists
  if (!memory.context) memory.context = {};
  if (!memory.context.plans) memory.context.plans = {};

  memory.context.plans[key] = {
    title,
    type,
    destination,
    days,
    budget,
    preferences,
    itinerary,
  };

  return {
    message: `✅ Your ${type} plan "${title}" for ${destination} has been saved successfully!`,
    updateContext: {
      plans: memory.context.plans,
    },
  };
}
