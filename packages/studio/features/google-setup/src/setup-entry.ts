import { type SetupService, type SetupStep, setupSteps } from "@halonicjs/google-setup";
import type { SetupEntry } from "@halonicjs/studio-feature-inbox/api";
import type { GoogleSetupAccount } from "./api.ts";
import { stepNames } from "./step-names.ts";

/** The steps a service added later needs: its APIs, its scopes and a new sign-in. */
const addServiceSteps: readonly SetupStep["id"][] = ["apis", "scopes", "sign-in"];

/** Shows an ISO time as you read it, such as "02:10". */
export type TimeFormat = (iso: string) => string;

/** UTC as `HH:MM`, for hosts that give no format of their own. */
export const utcTime: TimeFormat = (iso) => iso.slice(11, 16);

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function names(services: readonly SetupService[]): string {
  return new Intl.ListFormat("en").format(services.map((service) => service.label));
}

function steps(account: GoogleSetupAccount, services: readonly SetupService[]) {
  return setupSteps({
    route: account.record.route,
    accountType: account.record.accountType,
    account: account.email,
    ...(account.record.projectId === null ? {} : { projectId: account.record.projectId }),
    services,
  }).steps;
}

function onHold(account: GoogleSetupAccount): string {
  return account.routinesOnHold === 0
    ? ""
    : ` · ${plural(account.routinesOnHold, "routine", "routines")} on hold`;
}

/** The services that signed in but failed their check. */
function failing(account: GoogleSetupAccount): number {
  return Object.values(account.record.services).filter(
    ({ result }) => result.kind !== "works" && result.kind !== "allowed",
  ).length;
}

/**
 * What an account needs from you, as the Inbox's entry: the title and progress line of the UX
 * checklist (section 1). It is `undefined` when nothing is left to do, and for an account with no
 * service, which has nothing to set up. Studio never names Gmail or Drive: the steps and the
 * service names come from the account.
 *
 * @example
 * setupEntry(account, utcTime)?.progress; // "Step 4 of 7 · Scopes"
 */
export function setupEntry(account: GoogleSetupAccount, time: TimeFormat): SetupEntry | undefined {
  if (account.services.length === 0) return undefined;
  const { record, email } = account;
  const entry = (title: string, progress: string): SetupEntry => ({
    account: account.ref,
    title,
    progress,
    changedAt: account.changedAt,
  });

  if (record.refreshRefused?.reason === "client") {
    return entry(
      `Replace the Google client secret for ${email}`,
      `Needs a new client secret${onHold(account)}`,
    );
  }
  if (record.refreshRefused !== null) {
    return entry(
      `Sign in to Google again for ${email}`,
      `Needs sign-in since ${time(record.refreshRefused.at)}${onHold(account)}`,
    );
  }

  const all = steps(account, account.services);
  const next = all.find((step) => record.stepsDone[step.id] === undefined);
  if (next !== undefined) {
    return entry(
      `Set up Google for ${email}`,
      `Step ${next.number} of ${all.length} · ${stepNames[next.id]}`,
    );
  }
  if (account.adding.length > 0) {
    const count = steps(account, account.adding).filter((step) =>
      addServiceSteps.includes(step.id),
    ).length;
    return entry(
      `Add ${names(account.adding)} to ${email}`,
      `${plural(count, "step", "steps")} for ${names(account.adding)}`,
    );
  }
  const broken = failing(account);
  if (broken > 0) {
    return entry(
      `Set up Google for ${email}`,
      `Step ${all.length} of ${all.length} · ${plural(broken, "service", "services")} to fix`,
    );
  }
  return undefined;
}
