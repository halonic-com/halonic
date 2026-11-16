import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { FilesHost } from "../files-host.ts";
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
    setBusy(true);
    try {
      await host.create(wanted);
    } catch (error) {
      setBusy(false);
      // The host's sentences are about the path itself, so they belong under the field.
      return refuse(error instanceof Error ? error.message : String(error));
    }
    onCreated(wanted);
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
      <Field label={filesWords.path} hint={filesWords.pathHint} error={problem ?? null}>
        <Input
          ref={field}
          autoFocus
          disabled={busy}
          value={path}
          onChange={(event) => {
            setPath(event.target.value);
            setProblem(undefined);
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
