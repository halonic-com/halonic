import { Checkbox, Dialog, Field, Input, TextArea, useToastStore } from "@halonicjs/studio-kit";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { ShareChoice } from "../api.ts";
import { groupIntoItems } from "../change-items.ts";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { versionWords } from "../changes-words.ts";
import { suggestedVersionName } from "../version-name.ts";
import { type ShareToastWords, shareAndSay } from "./share-toasts.ts";
import { WhatsInIt } from "./whats-in-it.tsx";

/** Props for {@link CreateVersionDialog}. */
export interface CreateVersionDialogProps {
  readonly list: ChangesList;
  /** What's in the version: the files Create version was opened for. */
  readonly files: readonly ChangedFile[];
  /** Whether this is the first version of the workspace. */
  readonly first?: boolean;
  /** Where focus goes when the dialog closes and the button that opened it has gone. */
  readonly returnFocus: () => HTMLElement | null;
  /** Called once the version is made and the page has read again, for where focus goes next. */
  readonly onCreated: () => void;
  /** Whether a share address is set, so the version can be shared as it is made. */
  readonly canShare?: boolean;
  /** The workspace's remembered "Share with your team right away"; without it the box starts off. */
  readonly shareChoice?: ShareChoice | undefined;
}

/**
 * Create version on the desktop (checklist part 2, 2.6): a name that is offered and selected,
 * notes, and what's in it, Important changes first as before → after. There is no "Save first":
 * the Studio has already saved everything (save model). Ctrl Enter creates from any field and
 * Enter in Notes adds a line. An empty name says "Give this version a name." and focuses Name.
 * With a share address set, "Share with your team right away" shares the version once it is
 * made, and the box keeps the person's last choice.
 *
 * Not here yet: the tests line and "Ask for review".
 */
export function CreateVersionDialog({
  list,
  files,
  first = false,
  returnFocus,
  onCreated,
  canShare = false,
  shareChoice,
}: CreateVersionDialogProps) {
  const toasts = useToastStore();
  const nameField = useRef<HTMLInputElement>(null);
  const items = groupIntoItems(files);
  const [ticked, setTicked] = useState<ReadonlySet<string>>(
    () => new Set(items.map((item) => item.id)),
  );
  const [name, setName] = useState(() => suggestedVersionName(files, { first }));
  const [nameEdited, setNameEdited] = useState(false);
  const [notes, setNotes] = useState("");
  const [nameEmpty, setNameEmpty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [shareRightAway, setShareRightAway] = useState(() => shareChoice?.read() ?? false);

  // The offered name is selected, so typing replaces it.
  useEffect(() => nameField.current?.select(), []);

  /** The files of the ticked items. */
  const filesOf = (ids: ReadonlySet<string>) =>
    items.filter((item) => ids.has(item.id)).flatMap((item) => item.files);

  function tick(id: string, on: boolean) {
    const next = new Set(ticked);
    if (on) next.add(id);
    else next.delete(id);
    setTicked(next);
    // The offered name follows the ticked items until the person writes their own.
    if (!nameEdited) setName(suggestedVersionName(filesOf(next), { first }));
  }

  async function create() {
    if (busy) return;
    if (name.trim() === "") {
      setNameEmpty(true);
      nameField.current?.focus();
      return;
    }
    setBusy(true);
    setError(undefined);
    const reason = await list.createVersion(
      name,
      notes,
      filesOf(ticked).map((file) => file.path),
    );
    if (reason === undefined) {
      // The dialog is gone with the version, and so is the button that opened it.
      onCreated();
      if (canShare && shareRightAway) {
        void shareAndSay(list, toasts, sharedWordsFor(name.trim()));
        return;
      }
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
              setNameEdited(true);
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
        <WhatsInIt items={items} first={first} ticked={ticked} onTick={tick} />
        {canShare ? (
          <ShareRightAway
            checked={shareRightAway}
            onChange={(on) => {
              setShareRightAway(on);
              shareChoice?.write(on);
            }}
          />
        ) : null}
      </div>
    </Dialog>
  );
}

/**
 * "Share with your team right away" and what it means, under What's in it (2.6). A line above
 * sets it apart from the items to include, and the caption is the box's description, so a
 * screen reader hears it with the box.
 */
function ShareRightAway({
  checked,
  onChange,
}: {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const captionId = useId();
  return (
    <div className="mt-2 flex flex-col gap-1 border-t border-border pt-4">
      <Checkbox checked={checked} onChange={onChange} describedBy={captionId}>
        {versionWords.shareRightAway}
      </Checkbox>
      <p id={captionId} className="ms-6 text-small text-fg-muted">
        {versionWords.shareRightAwayCaption}
      </p>
    </div>
  );
}

/** The toasts of sharing a version as it is made: one success toast names the version. */
function sharedWordsFor(name: string): ShareToastWords {
  return { shared: () => versionWords.createdAndShared(name), afterReason: versionWords.savedHere };
}
