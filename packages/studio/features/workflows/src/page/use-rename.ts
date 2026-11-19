import { useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import type { WorkflowListing, WorkflowRef, WorkflowsHost } from "../api.ts";
import { pageWords } from "./page-words.ts";
import type { Load } from "./use-load.ts";

/** What the header's name field needs to rename the workflow. */
export interface Rename {
  /** Asks the host for the new name; says "Renamed to Mail triage." once it is, or why it isn't on a toast. */
  readonly apply: (name: string) => void;
  /** Why a new name can't be kept, as it is typed: another workflow of the hub has it. */
  readonly check: (name: string) => string | undefined;
}

/**
 * The workflow's rename (UX checklist 10.2): only the display name changes, the id and the file
 * stay. The host saves it as one undoable change. `undefined` while the host can't rename.
 */
export function useRename(
  host: WorkflowsHost,
  { hubId, id }: WorkflowRef,
  name: string,
  everyWorkflow: Load<readonly WorkflowListing[]>,
  announce: ((line: string) => void) | undefined,
): Rename | undefined {
  const toasts = useToastStore();
  const { rename } = host;
  if (rename === undefined) return undefined;
  // The other names of the hub; before the list is read, the host's own check still refuses.
  const others =
    everyWorkflow.kind === "ready"
      ? everyWorkflow.value.filter((one) => one.hubId === hubId && one.id !== id)
      : [];
  return {
    apply: (next) => {
      rename.call(host, { hubId, id }, next).then(
        () => announce?.(pageWords.renamed(next)),
        (error: unknown) =>
          toasts?.show({
            tone: "danger",
            title: pageWords.couldntRename(name),
            text: errorReasonFor(error),
          }),
      );
    },
    check: (next) => {
      const taken = others.find((one) => one.name.toLowerCase() === next.toLowerCase());
      return taken === undefined ? undefined : pageWords.nameTaken(next);
    },
  };
}
