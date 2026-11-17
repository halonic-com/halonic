import { useEffect, useRef, useState } from "react";
import type { FilesHost } from "../files-host.ts";
import { subscribeTrashed } from "../trash.ts";

/**
 * Whether a file that a tab holds is gone from the workspace now: deleted here (the tab keeps its
 * editor, greyed and read-only, with Undo) or taken away from outside Halonic. `onBack` is called
 * when a file that was gone is back (Undo, or a restore elsewhere), so the tab reads it again.
 * Nothing is watched until the tab has loaded the file (`ready`).
 */
export function useFileGone(
  host: Pick<FilesHost, "read" | "subscribe">,
  path: string,
  ready: boolean,
  trashed: boolean,
  onBack: () => void,
): boolean {
  const [gone, setGone] = useState(false);
  // A trash entry means the host already removed the file, before any read has said so.
  const was = useRef(false);
  if (trashed) was.current = true;
  const back = useRef(onBack);
  back.current = onBack;

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const check = () => {
      host.read(path).then(
        (text) => {
          if (stopped) return;
          if (text === null) {
            was.current = true;
            setGone(true);
          } else if (was.current) {
            was.current = false;
            setGone(false);
            back.current();
          }
        },
        () => {},
      );
    };
    const unsubscribe = host.subscribe(check);
    const unsubscribeTrash = subscribeTrashed(check);
    return () => {
      stopped = true;
      unsubscribe();
      unsubscribeTrash();
    };
  }, [ready, host, path]);

  return gone;
}
