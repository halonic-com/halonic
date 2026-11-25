import {
  type SetupService,
  type SetupStep,
  setupInputOf,
  setupSteps,
} from "@halonicjs/google-setup";
import type { GoogleSetupAccount } from "./api.ts";

/** The steps for an account and the services to set up, as the step generator makes them. */
export function accountSteps(
  account: GoogleSetupAccount,
  services: readonly SetupService[],
): readonly SetupStep[] {
  return setupSteps(setupInputOf(account.record, account.email, services)).steps;
}
