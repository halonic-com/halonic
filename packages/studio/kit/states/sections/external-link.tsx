import { ExternalLink } from "../../src/external-link/external-link.tsx";
import type { PartSection } from "../state-table.tsx";

function Sentence() {
  return (
    <p className="text-body">
      Set the redirect address on Google's{" "}
      <ExternalLink href="https://console.cloud.google.com/auth/audience">
        Audience page
      </ExternalLink>
      , then come back.
    </p>
  );
}

export const externalLinkSection: PartSection = {
  id: "external-link",
  number: "25.2",
  name: "ExternalLink",
  order: "25.2 · in a sentence",
  notApplicable:
    "disabled, error (the screen says it), busy (no look: it ignores clicks while the address is on its way)",
  rows: [
    { name: "Default", copies: () => <Sentence /> },
    { name: "Hover", force: "hover", target: "a", copies: () => <Sentence /> },
    { name: "Focus", force: "focus", target: "a", copies: () => <Sentence /> },
  ],
};
