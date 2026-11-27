import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";
import { keepTheKeyLine, keyName } from "../provider-key-parameters.ts";

/**
 * Creates a Cloudflare API token scoped to one zone (task HAL-17553,
 * architecture note 3.2). Cloudflare shows a new token once, so creating one
 * stays `guided` with no paste-back (architecture note, row 6): the token
 * never enters Studio. The permission is one of a reviewed few, always on the
 * one zone, never all zones. Source: Cloudflare's documentation (create API
 * token) and the page's own labels.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "cloudflare.create-token",
  version: 1,
  service: "cloudflare",
  title: "Create a Cloudflare API token",
  summary:
    "You create an API token for one zone on the Cloudflare dashboard and copy it for the next step.",
  // The token can change the zone it is scoped to.
  risk: "admin",
  parameters: strictParameters({
    keyName,
    zone: {
      kind: "text",
      pattern:
        /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?){1,8}$/,
    },
    permission: {
      kind: "choice",
      options: ["DNS · Edit", "DNS · Read", "Email Routing Rules · Edit", "Zone Settings · Edit"],
    },
  }),
  steps: [
    {
      kind: "guided",
      address: "https://dash.cloudflare.com/profile/api-tokens",
      instructions: [
        "Sign in to Cloudflare with your own account if the page asks.",
        "Click **Create Token**, then next to **Create Custom Token** click **Get started**.",
        "Type {keyName} as the **Token name**.",
        "Under **Permissions**, choose **Zone**, then {permission}. Add no other permission.",
        "Under **Zone Resources**, choose **Include**, **Specific zone** and {zone}. Never **All zones**.",
        "Click **Continue to summary**, check it names only {zone}, then click **Create Token**.",
        keepTheKeyLine,
      ],
      checkedOn: "from docs",
    },
  ],
  targets: (parameters) => [
    { service: "cloudflare", kind: "zone", name: String(parameters["zone"]) },
    { service: "cloudflare", kind: "API token", name: String(parameters["keyName"]) },
  ],
  preview: (parameters) => [
    `Opens your Cloudflare API tokens page, where you create the token ${parameters["keyName"]} with only Zone · ${parameters["permission"]} on ${parameters["zone"]} and copy it. Halonic never sees it.`,
  ],
};
