import { Button, Menu, MoreIcon, TrashStrip, useToastStore } from "@halonicjs/studio-kit";
import { errorReasonFor, PhoneTopBarActions, useInPhoneTopBar } from "@halonicjs/studio-shell";
import { type ReactNode, type RefObject, useEffect, useRef, useState } from "react";
import type { WorkflowRef, WorkflowsHost } from "../api.ts";
import { deleteWords } from "./delete-words.ts";
import { type LeftDeleted, putBackWorkflow, showLeftDeletedToast } from "./left-deleted-toast.ts";

/** What {@link useWorkflowTrash} needs to know of the page's workflow. */
export interface ShownWorkflow {
  /** The name the page shows; Delete keeps it, for once the workflow can't be read. */
  readonly name: string;
  /** Whether the page has read the workflow: there is no ⋮ before. */
  readonly ready: boolean;
}

/** What {@link useWorkflowTrash} gives the page. */
export interface WorkflowTrash {
  /**
   * The page's ⋮ button with **Delete**, or `null` before the workflow is read and where the host
   * can't delete. Under a phone top bar it goes there, after the workflow's name, wherever the
   * page puts it.
   */
  readonly menu: ReactNode;
  /** The strip with Undo that replaces the page after Delete, or `null` while the workflow is there. */
  readonly strip: ReactNode;
}

/**
 * The workflow page's ⋮ and its Delete (`workflows.page.menu`): Delete deletes the workflow and its
 * tests at once, with no dialog, and a strip with **Undo** then stands where the page was. Undo, or
 * the workspace's own undo, brings the page back and gives `title` the focus. Leaving the page while
 * the workflow is still deleted hands Undo to a toast that stays.
 */
export function useWorkflowTrash(
  host: WorkflowsHost,
  { hubId, id }: WorkflowRef,
  { name, ready }: ShownWorkflow,
  title: RefObject<HTMLElement | null>,
): WorkflowTrash {
  const toasts = useToastStore();
  const inTopBar = useInPhoneTopBar();
  const [removed, setRemoved] = useState<LeftDeleted>();
  // Set when the page comes back, so its title takes the focus once it is drawn again.
  const focusWhenBack = useRef(false);
  // Set while a Delete runs, so a second pick of Delete in the meantime does nothing.
  const deleting = useRef(false);
  // The toast of a failed Delete, which stays until closed: its Try again belongs to this page.
  const failedToast = useRef<string | undefined>(undefined);
  const inTrash = removed !== undefined;

  // Leaving the page closes that toast, so Try again can't delete with no strip and no Undo to see.
  useEffect(() => {
    return () => {
      if (failedToast.current !== undefined) toasts?.close(failedToast.current);
    };
  }, [toasts]);

  // Leaving the page with the strip up would take Undo with it, and Back skips a deleted page: a
  // toast that stays keeps the way back (C565 6).
  const leaving = useRef({ host, toasts, hubId, id, removed });
  leaving.current = { host, toasts, hubId, id, removed };
  useEffect(
    () => () => {
      const left = leaving.current;
      if (left.removed === undefined || left.toasts === null) return;
      showLeftDeletedToast(
        left.host,
        left.toasts,
        { hubId: left.hubId, id: left.id },
        left.removed,
      );
    },
    [],
  );

  useEffect(() => {
    if (inTrash || !focusWhenBack.current) return;
    focusWhenBack.current = false;
    title.current?.focus();
  }, [inTrash, title]);

  // The workspace's undo (Ctrl Z) can bring the workflow back past the strip; then the page returns.
  useEffect(() => {
    if (!inTrash) return;
    let live = true;
    const backAgain = () => {
      if (!live) return;
      focusWhenBack.current = true;
      setRemoved(undefined);
    };
    const stop = host.subscribe(() => void host.read({ hubId, id }).then(backAgain, () => {}));
    return () => {
      live = false;
      stop();
    };
  }, [inTrash, host, hubId, id]);

  const { trash, referencesTo } = host;
  if (trash === undefined) return { menu: null, strip: null };

  const onDelete = async () => {
    if (deleting.current) return;
    deleting.current = true;
    // A Delete picked from ⋮ while the last failure's toast is up replaces that toast: left open,
    // the page would lose track of it and couldn't close it when the person leaves.
    if (failedToast.current !== undefined) toasts?.close(failedToast.current);
    failedToast.current = undefined;
    try {
      // Who runs it is read while the files go: other workflows and routines don't change with the
      // delete. A failed read only leaves the strip without its second line.
      const [trashed, users] = await Promise.all([
        trash.call(host, { hubId, id }),
        referencesTo?.call(host, { hubId, id }).catch(() => undefined),
      ]);
      setRemoved({ trashed, name, line: users && deleteWords.usersLine(users) });
    } catch (error) {
      failedToast.current = toasts?.show({
        tone: "danger",
        title: deleteWords.couldntDelete(name, errorReasonFor(error)),
        sticky: true,
        action: { label: deleteWords.tryAgain, onClick: () => void onDelete() },
      });
    } finally {
      deleting.current = false;
    }
  };
  const onUndo = async () => {
    if (removed === undefined) return;
    await putBackWorkflow(removed.trashed, removed.name, toasts, () => {
      focusWhenBack.current = true;
      setRemoved(undefined);
    });
  };

  const button = (
    <Menu
      align="end"
      trigger={(props) => (
        <Button
          {...props}
          variant="ghost"
          size="sm"
          icon={<MoreIcon />}
          label={deleteWords.menuLabel(name)}
        />
      )}
      entries={[
        { id: "delete", label: deleteWords.delete, danger: true, onSelect: () => void onDelete() },
      ]}
    />
  );
  // Undo takes the focus, which was on the ⋮ that went with the page; it reads the strip's text
  // as its description, so no toast says it too. The strip gets 16px above it, like the page's sides.
  const strip =
    removed === undefined ? null : (
      <div className="pt-4">
        <TrashStrip
          text={deleteWords.deleted(removed.name, removed.line !== undefined)}
          detail={removed.line}
          undoLabel={deleteWords.undo}
          onUndo={onUndo}
          focusUndo
        />
      </div>
    );
  const menu = inTopBar ? <PhoneTopBarActions>{button}</PhoneTopBarActions> : button;
  return { menu: ready ? menu : null, strip };
}
