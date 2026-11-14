import type { CloudflareApi, TokenKind, TokenStatus } from "./api.ts";
import { DeployError } from "./errors.ts";
import { tokenKind } from "./token.ts";

/** A token that works and the account it deploys to. */
export interface ResolvedCredentials {
  readonly accountId: string;
  readonly kind: TokenKind;
}

/** What to resolve. */
export interface ResolveCredentialsOptions {
  readonly token: string;
  /** Needed only when the token can see more than one account. */
  readonly accountId?: string;
}

/**
 * Finds the account with `GET /accounts`, then verifies the token: `cfat_` at the account
 * endpoint, `cfut_` at the user endpoint, a legacy token at the user endpoint and, if that
 * fails, at the account one. No other `/user/*` or `/memberships` call (HAL-6804).
 */
export async function resolveCredentials(
  api: CloudflareApi,
  options: ResolveCredentialsOptions,
): Promise<ResolvedCredentials> {
  const kind = tokenKind(options.token);
  const accountId = await pickAccount(api, options.accountId);
  const status = await verify(api, kind, accountId);
  if (!status.active) {
    throw new DeployError("token-inactive", "Cloudflare says this API token isn't active.");
  }
  return { accountId, kind };
}

async function pickAccount(api: CloudflareApi, wanted: string | undefined): Promise<string> {
  const accounts = await api.listAccounts();
  if (wanted !== undefined) {
    if (accounts.some((account) => account.id === wanted)) return wanted;
    throw new DeployError("no-account", `This token can't see the Cloudflare account ${wanted}.`);
  }
  const [only, ...others] = accounts;
  if (only === undefined) {
    throw new DeployError("no-account", "This token can't see any Cloudflare account.");
  }
  if (others.length === 0) return only.id;
  const names = accounts.map((account) => `${account.name} (${account.id})`).join(", ");
  throw new DeployError(
    "ambiguous-account",
    `This token sees several accounts: ${names}. Name one.`,
  );
}

async function verify(
  api: CloudflareApi,
  kind: TokenKind,
  accountId: string,
): Promise<TokenStatus> {
  if (kind === "account") return api.verifyAccountToken(accountId);
  if (kind === "user") return api.verifyUserToken();
  try {
    const status = await api.verifyUserToken();
    if (status.active) return status;
  } catch (error) {
    if (!(error instanceof DeployError)) throw error;
  }
  return api.verifyAccountToken(accountId);
}
