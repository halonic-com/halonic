import type { Deployment } from "@halonicjs/format";
import type { DeploymentRef, DeployTarget } from "@halonicjs/ports";
import { KindedError } from "@halonicjs/std";

/**
 * Where a Cloudflare deployment from `deployments.yaml` lives, for every
 * deploy subcommand (deploy flow 2.2; requirement `app.deploy-account`). The
 * account in the file must be one the token reaches; with none in the file,
 * the token's one account is used, and a token that reaches several is
 * refused until the file says which. Only the account list is read, so
 * nothing on the host changes.
 *
 * @throws KindedError `not_found` when the deployment has no Worker in `deployments.yaml`
 * @throws KindedError `denied` when the token doesn't reach the file's account, or reaches none
 * @throws KindedError `invalid_input` when the file names no account and the token reaches several
 *
 * @example
 * const ref = await deploymentRefOf(target, "web", deployment);
 * // { name: "web", accountId: "9a78…", service: "acme", environment: "development" }
 */
export async function deploymentRefOf(
  target: Pick<DeployTarget, "accounts">,
  id: string,
  deployment: Deployment,
): Promise<DeploymentRef> {
  const settings = deployment.cloudflare;
  if (settings === undefined) {
    throw new KindedError("not_found", `There's no Worker for ${id} in deployments.yaml yet.`, {
      fix: `Add cloudflare.worker to ${id} in deployments.yaml, then run again.`,
    });
  }
  const accounts = await target.accounts();
  const ref = (accountId: string): DeploymentRef => ({
    name: id,
    accountId,
    service: settings.worker,
    environment: deployment.stage === "production" ? "production" : "development",
  });
  if (settings.account !== undefined) {
    if (accounts.some((account) => account.id === settings.account)) return ref(settings.account);
    throw new KindedError(
      "denied",
      `The token doesn't reach the account ${id} is on (${settings.account}).`,
      { fix: "Make a token for that account and save it: halonic deploy login cloudflare" },
    );
  }
  const [only, ...others] = accounts;
  if (only === undefined) {
    throw new KindedError("denied", "The token doesn't reach any Cloudflare account.", {
      fix: "Make a token for your account and save it: halonic deploy login cloudflare",
    });
  }
  if (others.length > 0) {
    throw new KindedError(
      "invalid_input",
      `The token reaches ${accounts.length} Cloudflare accounts, and deployments.yaml doesn't say which one ${id} is on.`,
      { fix: `Add the account's id to ${id} in deployments.yaml as cloudflare.account.` },
    );
  }
  return ref(only.id);
}
