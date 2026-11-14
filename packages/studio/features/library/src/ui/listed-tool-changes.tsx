import { type ListedToolChangeLabel, listedToolChangeLabel } from "@halonicjs/app/listed-tools";
import { WarningIcon } from "@halonicjs/studio-kit";
import { type WordPiece, wordDiff } from "../listed-tool-word-diff.ts";
import type { ListedToolDifference } from "../listed-tools-host.ts";
import { listedToolsWords } from "../listed-tools-words.ts";

/** Props for {@link ListedToolChanges}. */
export interface ListedToolChangesProps {
  readonly differences: readonly ListedToolDifference[];
  /** The tool's text is the same but its server connects differently. */
  readonly serverChanged: boolean;
  readonly sourceName: string;
}

const pieceStyle = {
  same: "",
  removed: "bg-danger-soft line-through",
  added: "bg-success-soft underline",
} as const;

/** One side of a changed text: the words that stay, with the words only this side has marked. */
function Side({
  label,
  pieces,
  own,
  missing,
  empty,
}: {
  readonly label: string;
  readonly pieces: readonly WordPiece[];
  readonly own: "removed" | "added";
  /** The text doesn't exist on this side, as against existing and being empty. */
  readonly missing: boolean;
  readonly empty: string;
}) {
  const shown = pieces.filter((piece) => piece.kind === "same" || piece.kind === own);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-small text-fg-muted">{label}</span>
      <p className="whitespace-pre-line text-body text-fg [overflow-wrap:anywhere]">
        {missing
          ? empty
          : shown.map((piece, index) => (
              <span key={`${index}:${piece.kind}`} className={pieceStyle[piece.kind]}>
                {piece.text}
              </span>
            ))}
      </p>
    </div>
  );
}

/** A change's label in the words of the screen. */
function labelText(label: ListedToolChangeLabel): string {
  switch (label.kind) {
    case "name":
      return listedToolsWords.changedName;
    case "description":
      return listedToolsWords.changedDescription;
    case "required":
      return listedToolsWords.changedRequired;
    case "argument":
      return listedToolsWords.changedArgument(label.argument, label.field);
    case "other":
      return listedToolsWords.changedOther(label.path);
  }
}

/** One changed text: its label, the approved version beside the new one, and a line when the change can't be seen. */
function Difference({ difference }: { readonly difference: ListedToolDifference }) {
  const pieces = wordDiff(difference.before ?? "", difference.after ?? "");
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <span className="text-small text-fg-muted [overflow-wrap:anywhere]">
        {labelText(listedToolChangeLabel(difference.path))}
      </span>
      <div className="grid min-w-0 grid-cols-1 gap-2 wide:grid-cols-2">
        <Side
          label={listedToolsWords.approvedVersion}
          pieces={pieces}
          own="removed"
          missing={difference.before === null}
          empty={listedToolsWords.none}
        />
        <Side
          label={listedToolsWords.newVersion}
          pieces={pieces}
          own="added"
          missing={difference.after === null}
          empty={listedToolsWords.removedText}
        />
      </div>
      {difference.hidden === null ? null : (
        <p className="flex items-start gap-2 text-small text-attention">
          <span className="mt-0.5 size-3.5 shrink-0">
            <WarningIcon />
          </span>
          {listedToolsWords.hidden[difference.hidden]}
        </p>
      )}
    </li>
  );
}

/**
 * What changed in a tool since it was approved: one labelled line per changed text, the approved
 * and the new version side by side (stacked on a phone). When only the server changed, a plate
 * says it connects differently.
 */
export function ListedToolChanges({
  differences,
  serverChanged,
  sourceName,
}: ListedToolChangesProps) {
  const plate = serverChanged && differences.length === 0;
  if (differences.length === 0 && !plate) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      {plate ? (
        <p className="rounded-md border border-border bg-surface-subtle px-3 py-2 text-small text-fg">
          {listedToolsWords.serverChangedOnly(sourceName)}
        </p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {differences.map((difference, index) => (
            <Difference key={`${index}:${difference.path}`} difference={difference} />
          ))}
        </ul>
      )}
    </div>
  );
}
