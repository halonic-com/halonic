import type { DeployAccount } from "@halonicjs/ports";
import type { CloudflareApi } from "./api.ts";
import { DeployError } from "./errors.ts";
import { portFailure } from "./port-failure.ts";
import { tokenKind } from "./token.ts";

/**
 * The accounts a token reaches, from `GET /accounts` (requirement
 * `deploy.target-accounts`). When Cloudflare refuses the list, the token is
 * verified to say why: an inactive token is `token-inactive`, an active one
 * lacks the permission to list accounts. An account token (`cfat_`) can only
 * be verified at an account, which isn't known yet, and a token Cloudflare
 * can't verify either keeps the list's own failure.
 */
export async function reachableAccounts(
  api: CloudflareApi,
  token: string,
): Promise<DeployAccount[]> {
  try {
    const accounts = await api.listAccounts();
    return accounts.map(({ id, name }) => ({ id, name }));
  } catch (error) {
    if (!(error instanceof DeployError) || tokenKind(token) === "account") throw error;
    const active = await api.verifyUserToken().then(
      (status) => status.active,
      () => undefined,
    );
    if (active === false) {
      throw portFailure(
        "token-inactive",
        "unauthenticated",
        "Cloudflare says this API token isn't active.",
        "Create a new token, then run `halonic deploy login`.",
      );
    }
    if (active === true) {
      throw portFailure(
        "missing-permission",
        "denied",
        "This Cloudflare API token can't list its accounts.",
        "Give the token the Account Settings Read permission, then run again.",
      );
    }
    throw error;
  }
}
