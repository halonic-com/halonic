import type { CloudProfile } from "./cloud-profile.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import type { SignedInHandler } from "./many-user-run-routes.ts";
import type { AccountUsage, UnitUsage } from "./many-users-api.ts";

/** Where the served Studio asks for the signed-in customer's account menu. */
export const accountMenuPath = "/api/account-menu";

/**
 * What the account menu of one signed-in request works with: Cloud's signed profile of the
 * customer, and their plan and usage. A request has one only on a server with Cloud sign-in whose
 * session carried a profile.
 */
export interface AccountMenuParts {
  readonly profile: CloudProfile;
  /** The principal's plan and usage; `null` when the server can't tell. */
  usage(): Promise<AccountUsage | null>;
}

/** From this percent of a unit's limit the app shows its usage banner (flow C3, `limit.warning`). */
export const usageWarningPercent = 80;

/**
 * `GET /api/account-menu`: the customer's name, the product's name, their plan, the percent of
 * the cost limit they used, the units at 80% or more of their limit and under 100% (`warnings`,
 * highest first), their billing state from Cloud's session (`billing`, `null` without one) and
 * the account page's addresses, each built from the `account` claim alone, with a fixed path or
 * fragment and nothing from the request or the user. It answers 404 without account
 * menu parts, so a single-user Studio, or many users without Cloud sign-in, shows no menu. The
 * server sends `Cache-Control: no-store` on every answer.
 */
export const accountMenuHandler: SignedInHandler = async (_request, _body, { accountMenu }) => {
  if (accountMenu === null) {
    return errorResponse(serverErrors.notFound);
  }
  const { profile } = accountMenu;
  const usage = await accountMenu.usage();
  return Response.json({
    name: profile.name,
    productName: profile.productName,
    plan: usage?.plan ?? null,
    usedPercent: usage?.usedPercent ?? null,
    warnings: warningsOf(usage?.units ?? []),
    billing: profile.billing,
    accountUrl: profile.account,
    planUrl: sectionAddress(profile.account, "plan"),
    plansUrl: pageAddress(profile.account, "plans", "?from=app"),
    billingUrl: sectionAddress(profile.account, "billing"),
    exportUrl: pageAddress(profile.account, "export"),
  });
};

/**
 * The units nearly used up, highest first. A used-up unit has none: its runs stop with their own
 * message, so a banner would say less than the run does.
 */
function warningsOf(units: readonly UnitUsage[]): UnitUsage[] {
  return units
    .filter(({ percent }) => percent >= usageWarningPercent && percent < 100)
    .map(({ unit, percent, resetsAt }) => ({ unit, percent, resetsAt }))
    .sort((left, right) => right.percent - left.percent);
}

/** A section of the account page: the same address with `#<section>` in place of any fragment. */
function sectionAddress(account: string, section: string): string {
  const url = new URL(account);
  url.hash = section;
  return url.href;
}

/**
 * A page under the account page: `<account>/<page>`, with the given query and no fragment.
 * `from=app` on Choose a plan makes its back button return to the app.
 */
function pageAddress(account: string, page: string, query = ""): string {
  const url = new URL(account);
  url.pathname = `${url.pathname.replace(/\/+$/, "")}/${page}`;
  url.search = query;
  url.hash = "";
  return url.href;
}
