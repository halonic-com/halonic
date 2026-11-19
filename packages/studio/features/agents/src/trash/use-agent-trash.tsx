import {
  Button,
  Menu,
  MoreIcon,
  TrashStrip,
  usePresentation,
  useToastStore,
} from "@halonicjs/studio-kit";
import { errorReasonFor, PhoneTopBarActions, useInPhoneTopBar } from "@halonicjs/studio-shell";
import { type ReactNode, useEffect, useState } from "react";
import type { AgentRef, AgentsHost, TrashedAgent } from "../api.ts";
import { deleteWords } from "./delete-words.ts";
import { putBackAgent, trashAgent } from "./trash-agent.ts";

/** What {@link useAgentTrash} needs of the open agent page. */
export interface AgentTrashInput {
  readonly host: AgentsHost;
  readonly agent: AgentRef;
  /** The name the page shows; Delete keeps it, for once the agent can't be read. */
  readonly name: string;
  /** Opens a workspace file in a tab; without it, and on a phone, the menu has no Open as file. */
  readonly openFile?: ((path: string) => void) | undefined;
  /**
   * Called once the agent is back, by Undo or by the workspace's own undo, so the page can give its
   * title the focus. Keep it stable (`useCallback`): a new one listens to the host over again.
   */
  readonly onRestored: () => void;
}

/** What {@link useAgentTrash} gives the page. */
export interface AgentTrash {
  /**
   * The page's ⋮ button, with Open as file and Delete. Under a phone top bar it goes there, after
   * the agent's name (UX 9.13), wherever the page puts it.
   */
  readonly menu: ReactNode;
  /** The strip with Undo that replaces the page after Delete, or `null` while the agent is there. */
  readonly strip: ReactNode;
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
  const inTopBar = useInPhoneTopBar();
  // The name is the one shown at Delete: once the agent is in the trash, the page can't read it.
  const [removed, setRemoved] = useState<{
    trashed: TrashedAgent;
    line: string | undefined;
    name: string;
  }>();
  const { hubId, id } = agent;

  // The workspace's undo (Ctrl Z) can bring the agent back past the strip; then the page returns.
  const inTrash = removed !== undefined;
  useEffect(() => {
    if (!inTrash) return;
    let live = true;
    const check = () =>
      host.read({ hubId, id }).then(
        () => {
          if (!live) return;
          setRemoved(undefined);
          onRestored();
        },
        () => undefined,
      );
    const stop = host.subscribe(() => void check());
    return () => {
      live = false;
      stop();
    };
  }, [inTrash, host, hubId, id, onRestored]);

  const onDelete = () =>
    void trashAgent(
      host,
      toasts,
      { hubId, id, name },
      // Focus goes to Undo, which reads the strip's text as its description: no toast says it too.
      { quiet: true, onTrashed: (trashed, line) => setRemoved({ trashed, line, name }) },
    );
  const onUndo = async () => {
    if (removed === undefined) return;
    if (await putBackAgent(removed.trashed, removed.name, toasts)) {
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

  const moreMenu = (
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
  const menu = inTopBar ? <PhoneTopBarActions>{moreMenu}</PhoneTopBarActions> : moreMenu;
  // Undo takes focus: the page and its ⋮ button, where focus was, are gone. The strip is the
  // first thing on the page, so it gets 16px above it, like the page's sides.
  const strip =
    removed === undefined ? null : (
      <div className="pt-4">
        <TrashStrip
          text={deleteWords.pageMoved(removed.line !== undefined)}
          detail={removed.line}
          undoLabel={deleteWords.undo}
          onUndo={onUndo}
          focusUndo
        />
      </div>
    );
  return { menu, strip };
}
