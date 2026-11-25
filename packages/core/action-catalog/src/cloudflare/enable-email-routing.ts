import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";

/**
 * Turns on Email Routing for a Cloudflare zone (inventory row 4, guided part
 * only). Enabling it adds DNS records and needs the user's own confirmation
 * on the dashboard. Rules and addresses through the API are in PR 11
 * (HAL-17530). Source:
 * https://developers.cloudflare.com/email-routing/get-started/enable-email-routing/
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "cloudflare.enable-email-routing",
  version: 1,
  service: "cloudflare",
  title: "Enable Cloudflare Email Routing",
  summary: "Turns on Email Routing for a domain in your Cloudflare account.",
  // Adds MX and TXT records to the zone, which can be removed again.
  risk: "admin",
  parameters: strictParameters({
    accountId: { kind: "text", pattern: /^[0-9a-f]{32}$/ },
    zone: { kind: "text", pattern: /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,3}$/ },
  }),
  steps: [
    {
      kind: "guided",
      address: "https://dash.cloudflare.com/{accountId}/{zone}/email/routing",
      instructions: [
        "Sign in to Cloudflare if the page asks.",
        "Click **Get started** (or **Enable Email Routing**).",
        "Read the DNS records Cloudflare lists, then click **Add records and enable**.",
        "Check that the page says Email Routing is **Enabled** for {zone}.",
      ],
      // From the public docs; nobody has walked it on the live page yet.
      checkedOn: "2026-11-25",
    },
  ],
  targets: (parameters) => [
    { service: "cloudflare", kind: "zone", name: String(parameters["zone"]) },
  ],
  preview: (parameters) => [
    `Opens Email Routing for ${parameters["zone"]} in Cloudflare, where you turn it on by hand. Halonic can't check it.`,
  ],
};
