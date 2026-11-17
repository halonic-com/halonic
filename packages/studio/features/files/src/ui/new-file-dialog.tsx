import { Callout, Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import { FilePathError, type FilesHost } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { checkNewPath } from "../new-file.ts";

/** The props of {@link NewFileDialog}. */
export interface NewFileDialogProps {
  readonly host: Pick<FilesHost, "create">;
  /** What the path starts with: `hubs/`, or the focused folder. */
  readonly start: string;
  /** After the file is made: the caller opens it. */
  readonly onCreated: (path: string) => void;
  readonly onCancel: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

function problemText(path: string): string | undefined {
  switch (checkNewPath(path)) {
    case "missing":
      return filesWords.pathMissing;
    case "outside":
      return filesWords.pathOutside;
    case "private":
      return filesWords.pathPrivate(path.trim());
    default:
      return undefined;
  }
}

/**
 * "New file" (`files.ui.new-file`): one Path field that starts with `hubs/` or the focused folder.
 * **Create** stays pressable with a bad path; the problem shows under the field and the text stays
 * selected for fixing.
 *
 * @example
 * <NewFileDialog host={host} start="hubs/" onCreated={open} onCancel={close} />
 */
export function NewFileDialog({
  host,
  start,
  onCreated,
  onCancel,
  returnFocus,
}: NewFileDialogProps) {
  const [path, setPath] = useState(start);
  const [problem, setProblem] = useState<string>();
  // The write itself failed, not the path: a Callout with Try again, not a sentence under the field.
  const [writeFailure, setWriteFailure] = useState<string>();
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  function refuse(message: string) {
    setProblem(message);
    field.current?.focus();
    field.current?.select();
  }

  async function create() {
    const wanted = path.trim();
    const own = problemText(wanted);
    if (own !== undefined) return refuse(own);
    setProblem(undefined);
    setWriteFailure(undefined);
    setBusy(true);
    try {
      await host.create(wanted);
    } catch (error) {
      setBusy(false);
      if (error instanceof FilePathError) return refuse(error.message);
      const reason = error instanceof Error ? error.message.trim() : "";
      setWriteFailure(filesWords.couldntCreate(wanted, reason === "" ? undefined : reason));
      return;
    }
    onCreated(wanted);
  }

  /** The Callout goes with the press, so focus returns to the field first and stays inside the form. */
  function retry(): void {
    field.current?.focus();
    void create();
  }

  return (
    <Dialog
      title={filesWords.newFileTitle}
      size="md"
      form
      confirm={{ label: filesWords.create, busyLabel: filesWords.creating }}
      busy={busy}
      onConfirm={() => void create()}
      onCancel={onCancel}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      {writeFailure !== undefined && (
        <div className="mb-3">
          <Callout tone="danger" action={{ label: filesWords.tryAgain, onClick: retry }}>
            {writeFailure}
          </Callout>
        </div>
      )}
      <Field label={filesWords.path} hint={filesWords.pathHint} error={problem ?? null}>
        <Input
          ref={field}
          autoFocus
          disabled={busy}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setProblem(undefined);
            setWriteFailure(undefined);
          }}
          onFocus={(event) => {
            // The cursor starts at the end, after the folder.
            const end = event.target.value.length;
            event.target.setSelectionRange(end, end);
          }}
        />
      </Field>
    </Dialog>
  );
}
