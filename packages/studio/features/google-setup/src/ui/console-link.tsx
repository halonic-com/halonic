import type { ConsolePage, SetupStep } from "@halonicjs/google-setup";
import { ExternalLink } from "@halonicjs/studio-kit";

/** Where each Console link goes, in words. Never "click here". */
const linkNames: Readonly<Record<ConsolePage, string>> = {
  "new-project": "New project page",
  branding: "Get started page",
  audience: "Audience page",
  "data-access": "Data access page",
  clients: "Clients page",
  "create-client": "Create client page",
};

/** Props for {@link ConsoleLink}. */
export interface ConsoleLinkProps {
  readonly step: SetupStep;
  readonly page: ConsolePage;
}

/** The step's link to a Console page, with the address the step generator made for it. */
export function ConsoleLink({ step, page }: ConsoleLinkProps) {
  const link = step.links.find((candidate) => candidate.id === page);
  if (link === undefined) return null;
  return <ExternalLink href={link.url}>{linkNames[page]}</ExternalLink>;
}
