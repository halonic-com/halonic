import { Button, Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import {
  ALREADY_WORKSPACE_NOTE,
  CHANGE_FOLDER,
  CREATE,
  CREATE_HERE,
  CREATING,
  cantWriteLine,
  FOLDER_FIELD,
  GIVE_IT_A_NAME,
  LOCAL_ONLY_NOTE,
  NAME_FIELD,
  NEW_WORKSPACE_TITLE,
  NOT_EMPTY_NOTE,
  OPEN_IT,
  OPENING,
} from "./new-workspace-text.ts";

/** What a folder holds, as far as the dialog needs to know. */
export type FolderState = "new" | "not-empty" | "workspace";

/** What creating a workspace left the trust record as. */
export type CreatedTrust =
  /** Created trusted: it wrote every template file. */
  | { readonly kind: "trusted" }
  /** It skipped a file that was there, so the workspace opens untrusted (HAL-65 decision 1). */
  | { readonly kind: "untrusted" }
  /** The files were written but the record wasn't; it opens untrusted. */
  | { readonly kind: "not-saved"; readonly reason: string }
  /** The person said no when the shell asked to open a folder that was there; nothing was written. */
  | { readonly kind: "cancelled" };

/** What the app does for the dialog: the folders, `createWorkspace` and the trust record. */
export interface NewWorkspaceHost {
  /** The parent the folder starts in: the person's Documents. */
  defaultParent(): Promise<string>;
  /** Asks the folder picker for a parent folder; `undefined` when cancelled. */
  pickParent?(): Promise<string | undefined>;
  /** The folder a name makes in a parent, with the platform's separator. */
  folderOf(parent: string, name: string): string;
  /** Whether the folder is new, holds files or is a workspace already. */
  probe(folder: string): Promise<FolderState>;
  /**
   * **Open it**: the shell asks the person to confirm, then opens the folder; its location, or
   * `undefined` when they say no. Without it the folder is opened as it is.
   */
  open?(folder: string): Promise<string | undefined>;
  /** Lays the workspace out (`createWorkspace`) and saves its trust record. Rejects with why it can't write. */
  create(folder: string, name: string): Promise<CreatedTrust>;
}

const BUTTON: Record<FolderState, string> = {
  new: CREATE,
  "not-empty": CREATE_HERE,
  workspace: OPEN_IT,
};

const NOTE: Record<FolderState, string> = {
  new: LOCAL_ONLY_NOTE,
  "not-empty": NOT_EMPTY_NOTE,
  workspace: ALREADY_WORKSPACE_NOTE,
};

/** The props of {@link NewWorkspaceDialog}. */
export interface NewWorkspaceDialogProps {
  readonly host: NewWorkspaceHost;
  /** After it's created: the window opens the folder beside the others and shows the toast. */
  readonly onCreated: (folder: string, name: string, trust: CreatedTrust) => void;
  /** **Open it**, when the folder is a workspace already. */
  readonly onOpen: (folder: string) => void;
  readonly onCancel: () => void;
}

/**
 * "New workspace" (flow-workspace 2.3): a name and the folder it goes in, `<parent>/<name>`.
 * **Create** stays pressable while Name is empty and says "Give it a name.". When the folder holds
 * files the button is **Create here**; when it is a workspace already it is **Open it**. A write
 * that fails shows its reason under the folder and keeps the dialog open.
 *
 * @example
 * <NewWorkspaceDialog host={host} onCreated={openBeside} onOpen={open} onCancel={close} />
 */
export function NewWorkspaceDialog({ host, onCreated, onOpen, onCancel }: NewWorkspaceDialogProps) {
  const [name, setName] = useState("");
  const [parent, setParent] = useState<string | undefined>(undefined);
  const [state, setState] = useState<FolderState>("new");
  const [nameError, setNameError] = useState<string | undefined>(undefined);
  const [writeError, setWriteError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const trimmed = name.trim();
  const folder = parent === undefined ? undefined : host.folderOf(parent, trimmed);

  useEffect(() => {
    let current = true;
    host.defaultParent().then((path) => current && setParent(path));
    return () => {
      current = false;
    };
  }, [host]);

  // What the folder holds follows the name; an answer for an older name is dropped.
  useEffect(() => {
    if (folder === undefined || trimmed === "") {
      setState("new");
      return;
    }
    let current = true;
    host.probe(folder).then(
      (found) => current && setState(found),
      () => current && setState("new"),
    );
    return () => {
      current = false;
    };
  }, [host, folder, trimmed]);

  async function openIt(target: string) {
    setWriteError(undefined);
    setBusy(true);
    try {
      const location = host.open === undefined ? target : await host.open(target);
      if (location !== undefined) {
        onOpen(location);
        return;
      }
    } catch (error) {
      setWriteError(cantWriteLine(error instanceof Error ? error.message : String(error)));
    }
    setBusy(false);
  }

  async function confirm() {
    if (state === "workspace" && folder !== undefined) {
      await openIt(folder);
      return;
    }
    if (trimmed === "" || folder === undefined) {
      setNameError(GIVE_IT_A_NAME);
      nameField.current?.focus();
      return;
    }
    setWriteError(undefined);
    setBusy(true);
    try {
      const made = await host.create(folder, trimmed);
      if (made.kind === "cancelled") {
        setBusy(false);
        return;
      }
      onCreated(folder, trimmed, made);
    } catch (error) {
      setWriteError(cantWriteLine(error instanceof Error ? error.message : String(error)));
      setBusy(false);
    }
  }

  async function change() {
    if (busy) return;
    const picked = await host.pickParent?.();
    if (picked !== undefined) setParent(picked);
  }

  return (
    <Dialog
      title={NEW_WORKSPACE_TITLE}
      size="md"
      form
      confirm={{
        label: BUTTON[state],
        busyLabel: state === "workspace" ? OPENING : CREATING,
      }}
      busy={busy}
      onConfirm={() => void confirm()}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3">
        <Field label={NAME_FIELD} error={nameError ?? null}>
          <Input
            ref={nameField}
            autoFocus
            disabled={busy}
            value={name}
            onChange={(event) => {
              setNameError(undefined);
              setWriteError(undefined);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={FOLDER_FIELD} error={writeError ?? null}>
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate">{trimmed === "" ? parent : folder}</span>
            {host.pickParent === undefined ? null : (
              <Button variant="secondary" onClick={() => void change()}>
                {CHANGE_FOLDER}
              </Button>
            )}
          </div>
        </Field>
        <p className="text-small text-fg-muted">{NOTE[state]}</p>
      </div>
    </Dialog>
  );
}
