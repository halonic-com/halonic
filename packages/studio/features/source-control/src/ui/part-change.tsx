import { type ChangeLine, type PartValue, partValueIn, sentenceChanges } from "@halonicjs/app";
import { diffWords, type WordPiece } from "@halonicjs/std";
import { StatusChip } from "@halonicjs/studio-kit";
import { useMemo } from "react";
import type { ChangedFile } from "../changes-list.ts";
import { partChangeWords, versionWords } from "../changes-words.ts";

/** What happened to a part: it was set, it was given a value, or its value was taken away. */
export type PartChangeKind = "changed" | "added" | "removed";

/** Tells what happened to a part from its value in the last version and now; null when neither has it. */
export function partChangeKind(before: PartValue, after: PartValue): PartChangeKind | null {
  if (!before.found && !after.found) return null;
  if (!before.found) return "added";
  if (!after.found) return "removed";
  return "changed";
}

/** A value as the person would write it: text as it is, anything else as indented JSON. */
export function shownValue(value: PartValue): string {
  if (!value.found) return versionWords.notSet;
  return typeof value.value === "string" ? value.value : JSON.stringify(value.value, null, 2);
}

/** Props for {@link PartChanges}. */
export interface PartChangesProps {
  readonly file: ChangedFile;
  readonly line: ChangeLine;
}

/**
 * The parts a change covers, in words: a neutral label (CHANGED, ADDED or REMOVED), the old value
 * struck through as `<del>` and the new one as `<ins>`, each with hidden "Before:" or "After:" for
 * a screen reader. Neither the label nor the strike-through rests on colour. A changed text, such
 * as instructions, shows only the sentences that changed, with the changed words in bold. Nothing
 * when the page has no text to read the values from.
 */
export function PartChanges({ file, line }: PartChangesProps) {
  const { texts } = file;
  const changes = useMemo(() => {
    if (texts === undefined) return [];
    return line.parts.flatMap((part) => {
      const before = partValueIn(texts.before, part);
      const after = partValueIn(texts.after, part);
      const kind = partChangeKind(before, after);
      return kind === null ? [] : [{ part, before, after, kind }];
    });
  }, [texts, line.parts]);
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      {changes.map(({ part, before, after, kind }) => (
        <div key={part.join("/")} className="flex items-start gap-2">
          <StatusChip tone="neutral">{partChangeWords[kind]}</StatusChip>
          <div className="flex min-w-0 flex-col gap-1">
            {valuePairs(before, after, kind).map((pair, index) => (
              <ValuePair key={index} pair={pair} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * One old value and the new one in its place, as pieces with the changed words marked; `null`
 * where the part has no old or no new value.
 */
export interface PairShown {
  readonly before: readonly WordPiece[] | null;
  readonly after: readonly WordPiece[] | null;
}

/**
 * What to show of a part's two values. A text that changed gives a pair for each run of changed
 * sentences only, as "Instructions edited: 1 sentence changed" counts them, so a one-word edit
 * doesn't repeat the whole text; the whole text is under Advanced. Anything else, or a text whose
 * sentences only changed spacing, gives the whole values, marked only when both are text.
 */
export function valuePairs(before: PartValue, after: PartValue, kind: PartChangeKind): PairShown[] {
  const was = kind === "added" ? null : shownValue(before);
  const is = kind === "removed" ? null : shownValue(after);
  if (was === null || is === null) {
    return [{ before: unmarked(was), after: unmarked(is) }];
  }
  const texts =
    before.found &&
    after.found &&
    typeof before.value === "string" &&
    typeof after.value === "string";
  const sentences = texts ? sentenceChanges(was, is) : [];
  if (sentences.length === 0) {
    return [texts ? diffWords(was, is) : { before: unmarked(was), after: unmarked(is) }];
  }
  return sentences.map(({ removed, added }) => {
    const diff = diffWords(removed.join(" "), added.join(" "));
    return {
      before: removed.length === 0 ? null : diff.before,
      after: added.length === 0 ? null : diff.after,
    };
  });
}

/** A whole value as one unmarked piece. */
function unmarked(text: string | null): readonly WordPiece[] | null {
  return text === null ? null : [{ text, changed: false }];
}

/** The old value struck through and the new one after it, each with its hidden word. */
function ValuePair({ pair }: { readonly pair: PairShown }) {
  return (
    <>
      {pair.before === null ? null : (
        <del className="text-small whitespace-pre-wrap break-words text-fg-muted">
          <span className="sr-only">{partChangeWords.before} </span>
          <Pieces pieces={pair.before} />
        </del>
      )}
      {pair.after === null ? null : (
        <ins className="text-small whitespace-pre-wrap break-words no-underline">
          <span className="sr-only">{partChangeWords.after} </span>
          <Pieces pieces={pair.after} />
        </ins>
      )}
    </>
  );
}

/** A value's pieces, the changed words in bold so they don't rest on colour. */
function Pieces({ pieces }: { readonly pieces: readonly WordPiece[] }) {
  return pieces.map((piece, index) =>
    piece.changed ? (
      <strong key={index} className="font-semibold">
        {piece.text}
      </strong>
    ) : (
      piece.text
    ),
  );
}
