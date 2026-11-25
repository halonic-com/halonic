import type { SetupInput, SetupService } from "./setup-input.ts";
import { personalAppOf, type SetupRecord } from "./setup-record.ts";

/**
 * What `setupSteps` needs for a saved setup: the route, the account type, the
 * project ID and how a personal app is published, all from the record, with
 * the account's address and the services to set up.
 *
 * @param record - the account's setup record.
 * @param account - the Google account's address.
 * @param services - the ticked services, or only the ones being added.
 *
 * @example
 * setupSteps(setupInputOf(record, "someone@example.com", services)).steps;
 */
export function setupInputOf(
  record: SetupRecord,
  account: string,
  services: readonly SetupService[],
): SetupInput {
  const app = personalAppOf(record);
  return {
    route: record.route,
    accountType: record.accountType,
    account,
    ...(record.projectId === null ? {} : { projectId: record.projectId }),
    ...(app === null ? {} : { publishing: app.publishing, sharedApp: app.sharedApp }),
    services,
  };
}
