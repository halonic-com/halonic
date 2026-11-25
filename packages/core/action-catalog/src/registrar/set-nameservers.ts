import { type StepperDefinition, strictParameters } from "@halonicjs/action-steppers";

/**
 * Points a domain at Cloudflare's nameservers at the registrar (inventory
 * row 4). Registrars have no common API, so the one step is `guided`. The
 * user picks their registrar from a reviewed list; each is the registrar's
 * own web origin. Cloudflare's zone and DNS calls are in PR 11 (HAL-17530).
 * Sources: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
 * (the nameserver step), https://www.namecheap.com/support/knowledgebase/article.aspx/767/10/how-can-i-change-the-nameservers-for-my-domain/,
 * https://www.godaddy.com/help/edit-my-domain-nameservers-664,
 * https://kb.porkbun.com/article/22-how-to-change-your-nameservers.
 */
export const definition: StepperDefinition<Record<string, string | number>> = {
  id: "registrar.set-nameservers",
  version: 1,
  service: "registrar",
  title: "Set a domain's nameservers at its registrar",
  summary: "Tells the registrar to use Cloudflare's nameservers for your domain.",
  // The domain stops resolving through the old nameservers at once.
  risk: "admin",
  parameters: strictParameters({
    registrar: {
      kind: "choice",
      options: ["ap.www.namecheap.com", "dcc.godaddy.com", "porkbun.com"],
    },
    domain: { kind: "text", pattern: /^[a-z0-9-]{1,63}(?:\.[a-z0-9-]{1,63}){1,3}$/ },
    nameserverOne: { kind: "text", pattern: /^[a-z0-9-]{1,63}\.ns\.cloudflare\.com$/ },
    nameserverTwo: { kind: "text", pattern: /^[a-z0-9-]{1,63}\.ns\.cloudflare\.com$/ },
  }),
  steps: [
    {
      kind: "guided",
      address: "https://{registrar}/",
      instructions: [
        "Sign in to your registrar if the page asks, and open the list of your domains.",
        "Open {domain} and find its nameserver setting. It's called **Nameservers**, **DNS servers** or **Custom DNS**.",
        "Choose the custom option (not the registrar's default) and replace every nameserver with these two: {nameserverOne} and {nameserverTwo}.",
        "Save. Check that the page now lists exactly those two and no others.",
        "Changes can take up to 24 hours to spread; Cloudflare shows the zone as **Active** when it sees them.",
      ],
      // From the registrars' public docs; nobody has walked them on the live pages yet.
      checkedOn: "2026-11-25",
    },
  ],
  targets: (parameters) => [
    { service: "registrar", kind: "domain", name: String(parameters["domain"]) },
  ],
  preview: (parameters) => [
    `Opens ${parameters["registrar"]}, where you set the nameservers of ${parameters["domain"]} to ${parameters["nameserverOne"]} and ${parameters["nameserverTwo"]} by hand. Halonic can't check it.`,
  ],
};
