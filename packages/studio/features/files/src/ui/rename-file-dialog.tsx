import { Dialog, Field, Input } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { FilesHost } from "../files-host.ts";
import { filesWords } from "../files-words.ts";
import { checkNewPath } from "../new-file.ts";

/** The props of {@link RenameFileDialog}. */
export interface RenameFileDialogProps {
  readonly host: Pick<FilesHost, "read" | "rename" | "renameImpact">;
  /** The file's path now. */
  readonly path: string;
  /** After the file is moved: the caller says so and opens the new path. */
  readonly onRenamed: (path: string) => void;
  readonly onCancel: () => void;
  readonly returnFocus?: () => HTMLElement | null;
}

/** What is wrong with the typed path without asking the host. */
function ownProblem(from: string, input: string): string | undefined {
  const wanted = input.trim();
  if (wanted === from) return filesWords.renameSame;
  switch (checkNewPath(wanted)) {
    case "missing":
      return filesWords.pathMissing;
    case "outside":
      return filesWords.pathOutside;
    case "private":
      return filesWords.pathPrivate(wanted);
    default:
      return undefined;
  }
}

/** Whether `wanted` is taken, and else how many places would be updated; a host that fails says neither. */
async function liveCheck(
  host: RenameFileDialogProps["host"],
  from: string,
  wanted: string,
): Promise<{ taken: boolean; places: number }> {
  try {
    if ((await host.read(wanted)) !== null) return { taken: true, places: 0 };
    return { taken: false, places: await host.renameImpact(from, wanted) };
  } catch {
    return { taken: false, places: 0 };
  }
}

/**
 * "Rename file" (`files.ui.rename-file`): one field with the file's path and its name selected.
 * While the user types, the dialog says whether the path is taken and how many places in other
 * files name the file and would be updated. **Rename** stays pressable; a problem shows under the field.
 *
 * @example
 * <RenameFileDialog host={host} path="library/collections/claims.collection.yaml" onRenamed={open} onCancel={close} />
 */
export function RenameFileDialog({
  host,
  path,
  onRenamed,
  onCancel,
  returnFocus,
}: RenameFileDialogProps) {
  const [value, setValue] = useState(path);
  const [problem, setProblem] = useState<string>();
  const [places, setPlaces] = useState(0);
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // The live check: a path that is taken is said while typing, and the places that follow are counted.
  useEffect(() => {
    const wanted = value.trim();
    if (ownProblem(path, wanted) !== undefined) {
      setPlaces(0);
      return;
    }
    let current = true;
    void liveCheck(host, path, wanted).then((result) => {
      if (!current) return;
      setPlaces(result.places);
      if (result.taken) setProblem(filesWords.renameTaken(wanted));
    });
    return () => {
      current = false;
    };
  }, [host, path, value]);

  function refuse(message: string) {
    setProblem(message);
    field.current?.focus();
    field.current?.select();
  }

  async function rename() {
    const wanted = value.trim();
    const own = ownProblem(path, wanted);
    if (own !== undefined) return refuse(own);
    setProblem(undefined);
    setBusy(true);
    try {
      await host.rename(path, wanted);
    } catch (error) {
      setBusy(false);
      return refuse(error instanceof Error ? error.message : String(error));
    }
    onRenamed(wanted);
  }

  return (
    <Dialog
      title={filesWords.renameTitle}
      size="md"
      form
      confirm={{ label: filesWords.renameConfirm, busyLabel: filesWords.renaming }}
      busy={busy}
      onConfirm={() => void rename()}
      onCancel={onCancel}
      {...(returnFocus === undefined ? {} : { returnFocus })}
    >
      <Field
        label={filesWords.renamePath}
        hint={places > 0 ? filesWords.alsoUpdates(places) : filesWords.pathHint}
        error={problem ?? null}
      >
        <Input
          ref={field}
          autoFocus
          disabled={busy}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setProblem(undefined);
          }}
          onFocus={(event) => {
            // The file's own name is selected, not its folder.
            const start = event.target.value.lastIndexOf("/") + 1;
            event.target.setSelectionRange(start, event.target.value.length);
          }}
        />
      </Field>
    </Dialog>
  );
}
