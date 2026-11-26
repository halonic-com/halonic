import {
  renderManualGuide,
  stepperRequestFormat,
  validateStepperRequest,
} from "@halonicjs/action-steppers";
import { shippedCatalog } from "./catalog.ts";

/** The manual guide for one use of a shipped definition, as the card shows it. Tests only. */
export function manualGuideFor(
  ref: string,
  parameters: Record<string, string | number>,
  title = "Do the npm step",
): string {
  const request = JSON.stringify({
    format: stepperRequestFormat,
    title,
    reason: "The release needs it.",
    blocks: [{ kind: "use", ref, parameters }],
  });
  const checked = validateStepperRequest(request, shippedCatalog);
  if (!checked.ok) throw new Error(checked.error.join("; "));
  return renderManualGuide(checked.value, shippedCatalog);
}
