import { Button, Menu, MoreIcon, usePresentation, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { type ReactNode, useId, useState } from "react";
import type { AgentRef, AgentsHost, TrashedAgent } from "../api.ts";
import { deleteWords } from "./delete-words.ts";
import { putBackAgent, trashAgent } from "./trash-agent.ts";

/** What {@link useAgentTrash} needs of the open agent page. */
export interface AgentTrashInput {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The name the page shows. */
  readonly name: string;
  /** Opens a workspace file in a tab; without it, and on a phone, the menu has no Open as file. */
  readonly openFile?: ((path: string) => void) | undefined;
  /** Called once Undo has put the agent back, so the page can give its title the focus. */
  readonly onRestored: () => void;
}

/** What {@link useAgentTrash} gives the page. */
export interface AgentTrash {
  /** The page's ⋮ button, with Open as file and Delete. */
  readonly menu: ReactNode;
  /** The strip with Undo that replaces the page after Delete, or `null` while the agent is there. */
  readonly strip: ReactNode;
}

/** Puts focus on Undo when the strip appears: the page and its ⋮ button, where focus was, are gone. */
function focusOnMount(button: HTMLButtonElement | null): void {
  button?.focus();
}

/**
 * Delete and Open as file for an open agent page (`agents.page.menu`): the ⋮ menu, and, once the
 * agent is in the trash, a strip with Undo that stands where "isn't in this workspace any more"
 * would. A page whose agent went some other way still shows that state.
 */
export function useAgentTrash({
  host,
  agent,
  name,
  openFile,
  onRestored,
}: AgentTrashInput): AgentTrash {
  const toasts = useToastStore();
  const phone = usePresentation() === "phone";
  const [removed, setRemoved] = useState<{ trashed: TrashedAgent; line: string | undefined }>();
  const stripTextId = useId();
  const { hubId, id } = agent;

  const onDelete = () =>
    void trashAgent(
      host,
      toasts,
      { hubId, id, name },
      // Focus goes to Undo, which reads the strip's text as its description: no toast says it too.
      { quiet: true, onTrashed: (trashed, line) => setRemoved({ trashed, line }) },
    );
  const onUndo = async () => {
    if (removed === undefined) return;
    if (await putBackAgent(removed.trashed, name, toasts)) {
      setRemoved(undefined);
      onRestored();
    }
  };
  const onOpenAsFile = () =>
    host.filePath({ hubId, id }).then(
      (path) => openFile?.(path),
      (error: unknown) =>
        toasts?.show({
          tone: "danger",
          title: deleteWords.couldntOpenFile(name),
          text: errorReasonFor(error),
        }),
    );

  const menu = (
    <Menu
      align="end"
      trigger={(props) => (
        <Button
          {...props}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={deleteWords.pageMenuLabel(name)}
        />
      )}
      entries={[
        ...(openFile === undefined || phone
          ? []
          : [{ id: "open-as-file", label: deleteWords.openAsFile, onSelect: onOpenAsFile }]),
        { id: "delete", label: deleteWords.delete, danger: true, onSelect: onDelete },
      ]}
    />
  );
  const strip =
    removed === undefined ? null : (
      <p className="flex flex-wrap items-center gap-2 px-4 py-5">
        <span id={stripTextId}>
          {deleteWords.pageMoved(removed.line !== undefined)}
          {removed.line === undefined ? null : (
            <>
              {" "}
              <span className="block">{removed.line}</span>
            </>
          )}
        </span>
        <Button
          ref={focusOnMount}
          variant="ghost"
          aria-describedby={stripTextId}
          onClick={() => void onUndo()}
        >
          {deleteWords.undo}
        </Button>
      </p>
    );
  return { menu, strip };
}
