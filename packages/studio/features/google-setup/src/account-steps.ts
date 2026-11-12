import { type SetupService, type SetupStep, setupSteps } from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "./api.ts";

/** The steps for an account and the services to set up, as the step generator makes them. */
export function accountSteps(
  account: GoogleSetupAccount,
  services: readonly SetupService[],
): readonly SetupStep[] {
  return setupSteps({
    route: account.record.route,
    accountType: account.record.accountType,
    account: account.email,
    ...(account.record.projectId === null ? {} : { projectId: account.record.projectId }),
    services,
  }).steps;
}
