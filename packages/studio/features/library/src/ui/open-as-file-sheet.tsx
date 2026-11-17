import type { LibraryItemKind } from "@halonicjs/app";
import { SidePanel } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useRef, useState } from "react";
import { openAsFileWords } from "../delete-words.ts";
import { itemFileName } from "../item-file.ts";
import type { LibraryItemPlace, LibraryItemsHost } from "../library-items-host.ts";
import { readFailureReason } from "../read-failure.ts";
import { LoadFailed } from "./load-failed.tsx";

/** The item whose file the sheet shows. */
export interface OpenedFile {
  readonly kind: LibraryItemKind;
  readonly place: LibraryItemPlace;
}

interface OpenAsFileSheetProps extends OpenedFile {
  readonly host: LibraryItemsHost;
  readonly context: ItemViewProps["context"];
  /** Back, and Escape while focus is in the sheet. Focus goes back to the menu's trigger. */
  readonly onClose: () => void;
}

type Read =
  | { readonly state: "loading" }
  | { readonly state: "loaded"; readonly text: string }
  | { readonly state: "failed"; readonly reason: string | undefined };

/**
 * Open as file on a phone (flow-library 8.3): the item's file as read-only text in a panel sheet,
 * the kit's `SidePanel` over the page with Back, titled with the file's name. Long lines wrap,
 * because nothing scrolls sideways on a phone. A file that isn't valid YAML still shows as text.
 */
export function OpenAsFileSheet({ host, context, kind, place, onClose }: OpenAsFileSheetProps) {
  const name = itemFileName(kind, place);
  const [read, setRead] = useState<Read>({ state: "loading" });
  // Callers often pass a new `place` object each render, so the read depends on its fields.
  const { hub, id } = place;
  const attempt = useRef(0);
  const load = useCallback(() => {
    const mine = ++attempt.current;
    setRead({ state: "loading" });
    host.readFile(kind, { hub, id }).then(
      (text) => mine === attempt.current && setRead({ state: "loaded", text }),
      (error: unknown) =>
        mine === attempt.current &&
        setRead({
          state: "failed",
          reason: readFailureReason(error, openAsFileWords.couldntLoad(kind, id), {
            kindName: openAsFileWords.kindName(kind),
          }),
        }),
    );
  }, [host, kind, hub, id]);
  useEffect(() => {
    load();
    return () => {
      attempt.current++;
    };
  }, [load]);

  const frame = useRef<HTMLDivElement>(null);
  // Escape while focus is in the sheet; the shell's close stack isn't open to features.
  useEffect(() => {
    const element = frame.current;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        event.preventDefault();
        onClose();
      }
    };
    element?.addEventListener("keydown", onKeyDown);
    return () => element?.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div ref={frame} className="fixed inset-0 z-40 bg-surface">
      <SidePanel
        title={name}
        onClose={onClose}
        {...(read.state === "loading" ? { loading: openAsFileWords.loading(kind, place.id) } : {})}
      >
        {read.state === "loaded" && (
          <pre className="text-code font-mono whitespace-pre-wrap text-fg wrap-anywhere">
            {read.text}
          </pre>
        )}
        {read.state === "failed" && (
          <LoadFailed
            title={openAsFileWords.couldntLoad(kind, place.id)}
            reason={read.reason}
            retryLabel={openAsFileWords.tryAgain}
            context={context}
            onRetry={load}
          />
        )}
      </SidePanel>
    </div>
  );
}
