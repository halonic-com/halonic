import type { DeployAccount } from "@halonicjs/ports";
import type { CloudflareApi } from "./api.ts";
import { DeployError } from "./errors.ts";
import { portFailure } from "./port-failure.ts";
import { tokenKind } from "./token.ts";

/** Where the token came from: the CI variable, or the one `halonic deploy login` saved. */
export type TokenSource = "environment" | "saved";

/** The environment variable a CI job sets the Cloudflare token in. */
export const tokenVariable = "HALONIC_CLOUDFLARE_API_TOKEN";

/**
 * The accounts a token reaches, from `GET /accounts` (requirement
 * `deploy.target-accounts`). When Cloudflare refuses the list with 401 or
 * 403, the token is verified to say why: an inactive token is
 * `token-inactive`, an active one lacks the permission to list accounts. Any
 * other failure, such as a 5xx or 429 while Cloudflare is down, keeps its
 * own, and so do an account token (`cfat_`), which can only be verified at an
 * account that isn't known yet, and a token Cloudflare can't verify. The
 * words follow deploy flow 3.1 and 3.2: an inactive token's fix depends on
 * where it came from, because in CI `login` isn't the fix.
 */
export async function reachableAccounts(
  api: CloudflareApi,
  token: string,
  source: TokenSource,
): Promise<DeployAccount[]> {
  try {
    const accounts = await api.listAccounts();
    return accounts.map(({ id, name }) => ({ id, name }));
  } catch (error) {
    const refused = error instanceof DeployError && (error.status === 401 || error.status === 403);
    if (!refused || tokenKind(token) === "account") throw error;
    const active = await api.verifyUserToken().then(
      (status) => status.active,
      () => undefined,
    );
    if (active === false) throw inactiveToken(source);
    if (active === true) {
      throw portFailure(
        "missing-permission",
        "denied",
        "The token can't list the Cloudflare accounts it reaches. Nothing changed on Cloudflare.",
        "Add Account · Account Settings · Read to the token in the Cloudflare dashboard, then run again.",
      );
    }
    throw error;
  }
}

/** An inactive token (deploy flow 3.1): in CI the fix is the variable, not `login`. */
function inactiveToken(source: TokenSource): Error {
  return source === "environment"
    ? portFailure(
        "token-inactive",
        "unauthenticated",
        `Cloudflare doesn't accept the token in ${tokenVariable}. It may have expired or been removed. Nothing changed on Cloudflare.`,
        `Make a new one and put it in ${tokenVariable}.`,
      )
    : portFailure(
        "token-inactive",
        "unauthenticated",
        "Cloudflare doesn't accept the saved token any more. It may have expired or been removed. Nothing changed on Cloudflare.",
        "Make a new one and save it: halonic deploy login cloudflare",
      );
}
