import type { CloudProfile } from "./cloud-profile.ts";
import { errorResponse, serverErrors } from "./errors.ts";
import type { SignedInHandler } from "./many-user-run-routes.ts";
import type { AccountUsage } from "./many-users-api.ts";

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

/**
 * `GET /api/account-menu`: the customer's name, the product's name, their plan, the percent of
 * the cost limit they used and the two account page addresses. It answers 404 without account
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
    accountUrl: profile.account,
    planUrl: planAddress(profile.account),
  });
};

/** The account page's plan section: the same address with `#plan` in place of any fragment. */
function planAddress(account: string): string {
  const url = new URL(account);
  url.hash = "plan";
  return url.href;
}
