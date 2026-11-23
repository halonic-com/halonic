import { useEffect, useState } from "react";
import type { FilesWithErrorsSource, FileWithErrors } from "./files-with-errors.ts";

/**
 * The shared list of files with errors, read again after every change and save of the files. Empty
 * where the app gives no list, and when the list can't be read, so a view that shows the list
 * shows nothing rather than a count it can't back up.
 *
 * @example
 * const files = useFilesWithErrors(context.services.find(FilesWithErrorsService));
 */
export function useFilesWithErrors(
  source: FilesWithErrorsSource | undefined,
): readonly FileWithErrors[] {
  const [files, setFiles] = useState<readonly FileWithErrors[]>([]);
  useEffect(() => {
    if (source === undefined) return;
    // Only the newest read counts, so a slow one can't put back a list an edit has changed.
    let reads = 0;
    const read = () => {
      const mine = ++reads;
      source.list().then(
        (list) => mine === reads && setFiles(list),
        () => mine === reads && setFiles([]),
      );
    };
    read();
    const stop = source.subscribe(read);
    return () => {
      reads = -1;
      stop();
    };
  }, [source]);
  return files;
}
