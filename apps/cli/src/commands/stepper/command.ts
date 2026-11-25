import type { StepperCatalog } from "@halonicjs/action-steppers";
import type { CliCommand } from "../../command.ts";
import { stepperMessages } from "../../messages/stepper.ts";
import { installedStepperCatalog } from "./catalog.ts";
import { printManualGuide } from "./guide.ts";

/**
 * `halonic stepper`, with the catalog passed in so tests can use an invented
 * one. Without a subcommand it prints its help.
 */
export function stepperCommandWith(catalog: StepperCatalog): CliCommand {
  return {
    name: "stepper",
    usage: "",
    summary: stepperMessages.summary(),
    options: {},
    subcommands: [
      {
        name: "guide",
        usage: "<file>",
        takesArguments: true,
        summary: stepperMessages.guideSummary(),
        action: () => stepperMessages.guideAction(),
        options: {},
        run: (input, context) => printManualGuide(input, context, catalog),
      },
    ],
  };
}

/** `halonic stepper guide <file>`: the manual guide of a stepper request. */
export const stepperCommand: CliCommand = stepperCommandWith(installedStepperCatalog);
