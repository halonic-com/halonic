import type { Deployment } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";
import {
  addKeyFix,
  type LoadedFile,
  ManyUsersSubscriptionError,
  manyUsersSubscriptionMessage,
  signInAgents,
} from "@halonicjs/workspace";

/** The deployment `halonic deploy` works on, or `none` when the workspace has no Cloudflare one yet. */
export type ChosenDeployment =
  | { readonly kind: "chosen"; readonly id: string; readonly deployment: Deployment }
  | { readonly kind: "none" };

/**
 * Picks the deployment to deploy (deploy flow 2.1; requirement
 * `app.deploy-service`). A named one must exist and run on Cloudflare: a
 * `local` one is refused with the `halonic serve` pointer. With no name, the
 * workspace's one Cloudflare deployment is chosen, `none` when it has none,
 * and several are wrong usage. A deployment with `users.meter: cloud` is
 * refused until Halonic Cloud can take its usage (requirement
 * `app.deploy-cloud-meter`), and one with `users.mode: many` while a harness
 * agent of the workspace's `files` has no provider key (requirement
 * `app.deploy-many-users-subscription`).
 *
 * @throws KindedError `invalid_input` for a `local` deployment, several to choose from, or `meter: cloud`
 * @throws ManyUsersSubscriptionError for `mode: many` with a harness agent that has no provider key
 * @throws KindedError `not_found` for a name `deployments.yaml` doesn't have
 *
 * @example
 * chooseDeployment("Acme", { web: { host: "cloudflare", ... } }, undefined);
 * // { kind: "chosen", id: "web", deployment: { host: "cloudflare", ... } }
 */
export function chooseDeployment(
  workspace: string,
  deployments: Readonly<Record<string, Deployment>>,
  name: string | undefined,
  files: readonly LoadedFile[],
): ChosenDeployment {
  if (name !== undefined) {
    const deployment = deployments[name];
    if (deployment === undefined) {
      throw new KindedError("not_found", `${workspace} has no deployment named ${name}.`, {
        fix: "Check the name in deployments.yaml.",
      });
    }
    if (deployment.host === "local") {
      throw new KindedError(
        "invalid_input",
        `${name} runs on your own machine, not on Cloudflare.`,
        {
          fix: `Start it with halonic serve ${name}.`,
        },
      );
    }
    return chosen(name, deployment, files);
  }
  const onCloudflare = Object.entries(deployments).filter(([, d]) => d.host === "cloudflare");
  const [only, ...others] = onCloudflare;
  if (only === undefined) return { kind: "none" };
  if (others.length > 0) {
    const ids = onCloudflare.map(([id]) => id).join(", ");
    throw new KindedError(
      "invalid_input",
      `${workspace} has ${onCloudflare.length} deployments on Cloudflare: ${ids}. Say which one.`,
      { fix: "Usage: halonic deploy <deployment>" },
    );
  }
  return chosen(only[0], only[1], files);
}

/**
 * The chosen deployment, unless it counts usage with `meter: cloud`: the
 * format accepts that meter so files can be written ahead, but nothing can
 * report usage to Halonic Cloud yet, and a deployment that ran without its
 * limits would let every user run unmetered. `meter: config` limits aren't
 * enforced yet either; that is safe only while nothing acts on `mode: many`,
 * so the slice that lets other users in must enforce or refuse them too.
 */
function chosen(
  id: string,
  deployment: Deployment,
  files: readonly LoadedFile[],
): ChosenDeployment {
  if (deployment.users?.meter === "cloud") {
    throw new KindedError(
      "invalid_input",
      `${id} counts usage with meter: cloud, which this version of Halonic can't do yet.`,
      { fix: "Use meter: config or meter: none in deployments.yaml." },
    );
  }
  if (deployment.users?.mode === "many") refuseSignInAgents(id, files);
  return { kind: "chosen", id, deployment };
}

/**
 * Other people start a `mode: many` deployment's runs, so a harness agent
 * with no provider key would run them on the owner's own sign-in: the
 * deploy stops on the first one, as `halonic validate` reports each.
 */
function refuseSignInAgents(id: string, files: readonly LoadedFile[]): void {
  const [agent] = signInAgents(files);
  if (agent === undefined) return;
  throw new ManyUsersSubscriptionError(
    manyUsersSubscriptionMessage(id, agent),
    { deployment: id, harness: agent.harness },
    addKeyFix(agent.providerType),
  );
}
