import type { ReactNode } from "react";
import { CommandBox } from "../../src/command-box/command-box.tsx";
import type { PartSection } from "../state-table.tsx";

const short = "halonic trust ~/work/acme";
const long =
  "halonic trust ~/work/acme/clients/very-long-folder-name/with-a-deep-path/support-reply-agent";

/** A column as wide as Trust's text, so the long path has to wrap. */
function Column({ children }: { readonly children: ReactNode }) {
  return <div className="flex w-full max-w-110 flex-col gap-3">{children}</div>;
}

function Boxes() {
  return (
    <Column>
      <CommandBox command={short} />
      <CommandBox command={long} />
    </Column>
  );
}

export const commandBoxSection: PartSection = {
  id: "command-box",
  number: "18.5",
  name: "CommandBox",
  order: "kit 18.5 · top to bottom: a short command, a long path that wraps anywhere",
  notApplicable:
    "disabled (it can always copy). Copied and couldn't copy: they follow a click on the real clipboard",
  rows: [
    { name: "Default", copies: () => <Boxes /> },
    { name: "Hover", force: "hover", target: "button", copies: () => <Boxes /> },
    { name: "Focus", force: "focus", target: "button", copies: () => <Boxes /> },
  ],
};
