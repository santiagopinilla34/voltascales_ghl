"use client";

import { createContext, useContext } from "react";

/**
 * Every stage name in the organization, for the two places a rule names one.
 *
 * A context rather than a prop threaded down, because the stage dropdowns live
 * inside the trigger and action field sets — three components below the
 * builder, neither of which has any other reason to know about pipelines.
 *
 * Names rather than ids, because that is what a rule stores: `set_pipeline_stage`
 * carries a stage name and the executor resolves it against whichever pipeline
 * the contact is on. One organization can have "Closed" on three pipelines and
 * a rule that says "Closed" means all of them.
 *
 * Empty is a legitimate value — a brand-new organization before its seed, or
 * the builder rendered in a story — and the dropdowns say so rather than
 * showing an empty list with no explanation.
 */
const StageOptionsContext = createContext<string[]>([]);

export const StageOptionsProvider = StageOptionsContext.Provider;

export function useStageOptions(): string[] {
  return useContext(StageOptionsContext);
}
