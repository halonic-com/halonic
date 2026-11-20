import { NameField } from "@halonicjs/studio-shell";
import { pageWords } from "./page-words.ts";
import type { Rename } from "./use-rename.ts";

/**
 * The workflow's name in the header: a rename field once the workflow is read, where it can be
 * renamed; else the name. A phone's top bar names the workflow, so its title stays text.
 */
export function WorkflowName({
  name,
  rename,
  ready,
  phone,
}: {
  readonly name: string;
  readonly rename: Rename | undefined;
  readonly ready: boolean;
  readonly phone: boolean;
}) {
  if (rename === undefined || !ready || phone) return name;
  return (
    <NameField
      name={name}
      label={pageWords.nameField}
      onRename={rename.apply}
      check={rename.check}
    />
  );
}
