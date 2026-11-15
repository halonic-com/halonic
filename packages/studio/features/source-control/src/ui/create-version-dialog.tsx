import { Dialog, Field, Input, TextArea, useToastStore } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { versionWords } from "../changes-words.ts";
import { suggestedVersionName } from "../version-name.ts";
import { WhatsInIt } from "./whats-in-it.tsx";

/** Props for {@link CreateVersionDialog}. */
export interface CreateVersionDialogProps {
  readonly list: ChangesList;
  /** What's in the version: the files Create version was opened for. */
  readonly files: readonly ChangedFile[];
  /** Where focus goes when the dialog closes and the button that opened it has gone. */
  readonly returnFocus: () => HTMLElement | null;
}

/**
 * Create version on the desktop (checklist part 2, 2.6): a name that is offered and selected,
 * notes, and what's in it, Important changes first as before → after. There is no "Save first":
 * the Studio has already saved everything (save model). Ctrl Enter creates from any field and
 * Enter in Notes adds a line. An empty name says "Give this version a name." and focuses Name.
 *
 * Not here yet: the tests line, "Share with your team right away" and "Ask for review".
 */
export function CreateVersionDialog({ list, files, returnFocus }: CreateVersionDialogProps) {
  const toasts = useToastStore();
  const nameField = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(() => suggestedVersionName(files.map((file) => file.path)));
  const [notes, setNotes] = useState("");
  const [nameEmpty, setNameEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  // The offered name is selected, so typing replaces it.
  useEffect(() => nameField.current?.select(), []);

  async function create() {
    if (busy) return;
    if (name.trim() === "") {
      setNameEmpty(true);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    const reason = await list.createVersion(name, notes);
    if (reason === undefined) {
      // The dialog is gone with the version, and so is the button that opened it.
      toasts?.show({ tone: "success", title: versionWords.created(name.trim()) });
      return;
    }
    setBusy(false);
    setError(`${versionWords.failed}. ${reason}`);
  }

  function createOnCtrlEnter(event: KeyboardEvent) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void create();
    }
  }

  return (
    <Dialog
      title={versionWords.createVersion}
      size="md"
      form
      confirm={{ label: versionWords.createVersion, busyLabel: versionWords.creating }}
      busy={busy}
      {...(error === undefined ? {} : { error, retryLabel: versionWords.tryAgain })}
      returnFocus={returnFocus}
      onConfirm={() => void create()}
      onCancel={() => list.cancelVersion()}
    >
      <div className="flex flex-col gap-4">
        <Field label={versionWords.name} error={nameEmpty ? versionWords.emptyName : null}>
          <Input
            ref={nameField}
            value={name}
            onKeyDown={createOnCtrlEnter}
            onChange={(event) => {
              setNameEmpty(false);
              setName(event.target.value);
            }}
          />
        </Field>
        <Field label={versionWords.notes}>
          <TextArea
            value={notes}
            submitOnCtrlEnter
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <WhatsInIt files={files} />
      </div>
    </Dialog>
  );
}
