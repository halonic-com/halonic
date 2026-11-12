import type { SetupService, SetupStep } from "@halonicjs/google-setup";
import type { SetupEntry } from "@halonicjs/studio-feature-inbox/api";
import { accountSteps } from "./account-steps.ts";
import type { GoogleSetupAccount } from "./api.ts";
import { stepNames } from "./step-names.ts";

/** The steps a service added later needs: its APIs, its scopes and a new sign-in. */
const addServiceSteps: readonly SetupStep["id"][] = ["apis", "scopes", "sign-in"];

/** Shows a time as the Inbox does, such as "02:10", "Sat 02:10" or "Sat 31 Oct, 02:10". */
export type TimeFormat = (at: Date, now: Date) => string;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

function names(services: readonly SetupService[]): string {
  return new Intl.ListFormat("en").format(services.map((service) => service.label));
}

function onHold(account: GoogleSetupAccount): string {
  return account.routinesOnHold === 0
    ? ""
    : ` · ${plural(account.routinesOnHold, "routine", "routines")} on hold`;
}

/**
 * The listed services that signed in but failed their check. The record keeps the result of a
 * service the user later unticked, so only the services still listed count.
 */
function failing(account: GoogleSetupAccount): number {
  return account.services.filter((service) => {
    const checked = account.record.services[service.id];
    return (
      checked !== undefined && checked.result.kind !== "works" && checked.result.kind !== "allowed"
    );
  }).length;
}

/**
 * What an account needs from you, as the Inbox's entry: the title and progress line of the UX
 * checklist (section 1). It is `undefined` when nothing is left to do, and for an account with no
 * service, which has nothing to set up. A refused sign-in says when it was refused the way the
 * Inbox says times, because Google refuses a token after 7 days in testing mode and "since 02:10"
 * would read as today. Studio never names Gmail or Drive: the steps and the
 * service names come from the account.
 *
 * @example
 * setupEntry(account, clockTime, new Date())?.progress; // "Step 4 of 7 · Scopes"
 */
export function setupEntry(
  account: GoogleSetupAccount,
  time: TimeFormat,
  now: Date,
): SetupEntry | undefined {
  if (account.services.length === 0) return undefined;
  const { record, email } = account;
  const entry = (title: string, progress: string): SetupEntry => ({
    account: record.accountRef,
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
      `Needs sign-in since ${time(new Date(record.refreshRefused.at), now)}${onHold(account)}`,
    );
  }

  const all = accountSteps(account, account.services);
  const next = all.find((step) => record.stepsDone[step.id] === undefined);
  if (next !== undefined) {
    return entry(
      `Set up Google for ${email}`,
      `Step ${next.number} of ${all.length} · ${stepNames[next.id]}`,
    );
  }
  if (account.adding.length > 0) {
    const count = accountSteps(account, account.adding).filter((step) =>
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
