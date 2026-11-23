import type { ThinSpecModel } from "./score.ts";

/**
 * The fitted thin-spec model, exported from halonic-com/variant-router
 * (`thin_spec.py --export`, fitted on all 460 trial tasks). The trial's
 * readings stay on the trial server, so the weights are copied here; until
 * they are, the check stays off whatever the settings say.
 */
export const fittedModel: ThinSpecModel | undefined = undefined;
