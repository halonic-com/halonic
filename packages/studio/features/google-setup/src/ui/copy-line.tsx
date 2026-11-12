import type { CopyValueId, SetupStep } from "@halonicjs/google-setup";
import { CopyButton } from "@halonicjs/studio-kit";

/** What each value is called, and the name its **Copy** button gives screen readers. */
const copyNames: Readonly<Record<CopyValueId, { label: string; copy: string }>> = {
  "project-name": { label: "Project name", copy: "Copy the project name" },
  "app-name": { label: "App name", copy: "Copy the app name" },
  "support-email": { label: "User support e-mail", copy: "Copy the user support e-mail" },
  "contact-email": { label: "Contact e-mail", copy: "Copy the contact e-mail" },
  "all-scopes": { label: "All scopes", copy: "Copy all scopes" },
  "client-name": { label: "Client name", copy: "Copy the client name" },
};

/** Props for {@link CopyLine}. */
export interface CopyLineProps {
  readonly step: SetupStep;
  readonly id: CopyValueId;
}

/**
 * One value the user types into Google, with **Copy**. The value comes from the step, so Studio
 * writes none of them. Nothing here ever copies a secret: the client secret isn't a step value.
 */
export function CopyLine({ step, id }: CopyLineProps) {
  const found = step.copyValues.find((candidate) => candidate.id === id);
  if (found === undefined) return null;
  const { label, copy } = copyNames[id];
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-body text-fg-muted">{label}</span>
      <code className="min-w-0 break-all text-body text-fg">{found.value}</code>
      <CopyButton text={found.value} label={copy} />
    </div>
  );
}
