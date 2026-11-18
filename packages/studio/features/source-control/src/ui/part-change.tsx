import { type ChangeLine, type PartValue, partValueIn } from "@halonicjs/app";
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
 * a screen reader. Neither the label nor the strike-through rests on colour. Nothing when the page
 * has no text to read the values from.
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
            {kind === "added" ? null : (
              <del className="text-small whitespace-pre-wrap break-words text-fg-muted">
                <span className="sr-only">{partChangeWords.before} </span>
                {shownValue(before)}
              </del>
            )}
            {kind === "removed" ? null : (
              <ins className="text-small whitespace-pre-wrap break-words no-underline">
                <span className="sr-only">{partChangeWords.after} </span>
                {shownValue(after)}
              </ins>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
