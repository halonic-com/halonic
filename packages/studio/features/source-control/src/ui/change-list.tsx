import type { ChangeLine } from "@halonicjs/app";
import { Button, useToastStore } from "@halonicjs/studio-kit";
import { useId, useState } from "react";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { listWords, undoWords, versionWords } from "../changes-words.ts";

/** Props for {@link ChangeList}. */
export interface ChangeListProps {
  readonly list: ChangesList;
  readonly files: readonly ChangedFile[];
}

/**
 * What changed, file by file (checklist part 2, 2.2), under "Since your last version" with its
 * count and Create version. In each file the Important changes come
 * first, each as before → after, then the others; every change that can be undone on its own has
 * Undo this change.
 */
export function ChangeList({ list, files }: ChangeListProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-heading">{versionWords.sinceLastVersion}</h2>
        <span className="text-small text-fg-muted">{versionWords.itemCount(files.length)}</span>
        <span className="flex-1" />
        <Button variant="primary" size="sm" onClick={() => list.startVersion()}>
          {versionWords.createVersion}
        </Button>
      </div>
      <ul className="flex flex-col gap-4">
        {files.map((file) => (
          <li key={file.path}>
            <FileChanges list={list} file={file} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function FileChanges({ list, file }: { readonly list: ChangesList; readonly file: ChangedFile }) {
  const { lines } = file.description;
  const important = lines.filter((line) => line.important);
  const other = lines.filter((line) => !line.important);
  return (
    <section aria-label={file.path} className="flex flex-col gap-2">
      <h2 className="text-heading break-all">{file.path}</h2>
      {important.length === 0 ? null : (
        <Group title={listWords.important} list={list} file={file} lines={important} />
      )}
      {other.length === 0 ? null : (
        <Group
          title={important.length === 0 ? undefined : listWords.other}
          list={list}
          file={file}
          lines={other}
        />
      )}
    </section>
  );
}

function Group({
  title,
  list,
  file,
  lines,
}: {
  readonly title: string | undefined;
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly lines: readonly ChangeLine[];
}) {
  return (
    <div className="flex flex-col gap-1">
      {title === undefined ? null : <h3 className="text-label text-fg-muted">{title}</h3>}
      <ul className="flex flex-col gap-1">
        {lines.map((line) => (
          <li key={line.id}>
            <ChangeRow list={list} file={file} line={line} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One change and its Undo this change, or why it can't be undone yet. */
function ChangeRow({
  list,
  file,
  line,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly line: ChangeLine;
}) {
  const toasts = useToastStore();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string>();
  const reasonId = useId();
  const dependent = file.description.lines.find((other) => other.needs?.includes(line.id));

  async function undo() {
    setBusy(true);
    setFailure(undefined);
    const outcome = await list.undoChange(file, line);
    setBusy(false);
    if (outcome.kind === "failed") {
      setFailure(outcome.reason);
      return;
    }
    toasts?.show({
      tone: "success",
      title: undoWords.undone,
      text: line.sentence,
      action: { label: undoWords.undo, onClick: () => void putBack(outcome.undo) },
    });
  }

  /** The toast's Undo: puts the change back, or says why it couldn't. */
  async function putBack(undo: () => Promise<string | undefined>) {
    const reason = await undo();
    if (reason === undefined) return;
    toasts?.show({ tone: "danger", title: undoWords.undoFailed, text: reason });
  }

  return (
    <div className="flex items-center gap-3">
      <span className="text-body flex-1">{line.sentence}</span>
      {line.parts.length === 0 ? null : (
        <Button
          variant="ghost"
          size="sm"
          busy={busy}
          unavailable={dependent === undefined ? undefined : { reason: reasonId }}
          onClick={() => void undo()}
        >
          {listWords.undoThisChange}
        </Button>
      )}
      {dependent === undefined ? null : (
        <span id={reasonId} className="text-small text-fg-muted">
          {listWords.undoThatFirst(dependent.sentence)}
        </span>
      )}
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {undoWords.failed}. {failure}
        </span>
      )}
    </div>
  );
}
