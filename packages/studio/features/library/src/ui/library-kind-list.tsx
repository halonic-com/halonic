import type { LibraryItemKind } from "@halonicjs/app";
import { countLine, libraryKinds, tabLabel } from "../library-words.ts";
import { PlainList } from "./plain-list.tsx";

/** The props of {@link LibraryKindList}. */
export interface LibraryKindListProps {
  /** How many of each kind there are; a kind not read yet (or that failed) shows no line. */
  readonly counts?: Partial<Record<LibraryItemKind, number>>;
  /** How many connectors are blocked; none, or not read, adds nothing to the Connectors line. */
  readonly blockedConnectors?: number;
  readonly onOpenKind: (kind: LibraryItemKind) => void;
  /** The Plugins row's action. Without it, the list has no Plugins row. */
  readonly onOpenPlugins?: () => void;
}

const rowClass =
  "flex min-h-11 w-full items-center justify-between gap-3 border-b border-border px-4 py-2 text-left";

/**
 * The Library on a phone (flow-library 8): a flush list of the four kinds, each with how many it has, and Plugins, each row
 * opening that kind's list on its own page. The heading is for a screen reader; the top bar and
 * the bottom navigation stay.
 */
export function LibraryKindList({
  counts = {},
  blockedConnectors = 0,
  onOpenKind,
  onOpenPlugins,
}: LibraryKindListProps) {
  return (
    <div>
      <h1 className="sr-only">Library</h1>
      <PlainList>
        {libraryKinds.map((kind) => (
          <li key={kind}>
            <button type="button" className={rowClass} onClick={() => onOpenKind(kind)}>
              <span className="flex min-w-0 flex-col">
                <span className="text-body">{tabLabel(kind)}</span>
                {counts[kind] !== undefined && (
                  <span className="text-small text-fg-muted">
                    {countLine(kind, counts[kind], kind === "connector" ? blockedConnectors : 0)}
                  </span>
                )}
              </span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
        {onOpenPlugins !== undefined && (
          <li>
            <button type="button" className={rowClass} onClick={onOpenPlugins}>
              <span className="text-body">Plugins</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        )}
      </PlainList>
    </div>
  );
}
