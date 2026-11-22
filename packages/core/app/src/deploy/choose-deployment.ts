import type { Deployment } from "@halonicjs/format";
import { KindedError } from "@halonicjs/std";

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
 * `app.deploy-cloud-meter`).
 *
 * @throws KindedError `invalid_input` for a `local` deployment, several to choose from, or `meter: cloud`
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
    return chosen(name, deployment);
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
  return chosen(only[0], only[1]);
}

/**
 * The chosen deployment, unless it counts usage with `meter: cloud`: the
 * format accepts that meter so files can be written ahead, but nothing can
 * report usage to Halonic Cloud yet, and a deployment that ran without its
 * limits would let every user run unmetered.
 */
function chosen(id: string, deployment: Deployment): ChosenDeployment {
  if (deployment.users?.meter === "cloud") {
    throw new KindedError(
      "invalid_input",
      `${id} counts usage with meter: cloud, which this version of Halonic can't do yet.`,
      { fix: "Use meter: config or meter: none in deployments.yaml." },
    );
  }
  return { kind: "chosen", id, deployment };
}
