import type { LineChange } from "@halonicjs/std";
import { Button } from "@halonicjs/studio-kit";
import { useRef, useState } from "react";
import type { ChangedFile, ChangesList } from "../changes-list.ts";
import { discardWords } from "../changes-words.ts";
import { type ChangeHeadingLevel, headingTag } from "./heading-level.ts";
import type { DiscardToasts } from "./use-discard-toasts.ts";

/** What tells one part of a file from the others. */
function partKey(part: LineChange): string {
  return `${part.beforeStart}:${part.afterStart}`;
}

/** "Lines 12 to 18": where the part is in the file now, or where it was when it only removed lines. */
function partHeading(part: LineChange): string {
  if (part.added.length > 0) {
    return discardWords.partLines(part.afterStart + 1, part.afterStart + part.added.length);
  }
  return discardWords.partLines(part.beforeStart + 1, part.beforeEnd);
}

/**
 * The line diff of one file, shown under Advanced. With `discarding`, which only the developer view
 * passes, each part has its own "Discard this part".
 */
export function LineDiff({
  list,
  file,
  hunks,
  level,
  discarding,
}: {
  readonly list: ChangesList;
  readonly file: ChangedFile;
  readonly hunks: readonly LineChange[];
  /** The level of each part's heading, "Line 3": as the file's groups' headings. */
  readonly level: ChangeHeadingLevel;
  readonly discarding: DiscardToasts | undefined;
}) {
  const PartHeading = headingTag(level);
  const [failure, setFailure] = useState<string>();
  // The part being discarded: a second press on it, or on another part, would find the file changed.
  const [busyPart, setBusyPart] = useState<string>();
  // A ref too, since a second press can come before the page has drawn the busy state.
  const working = useRef(false);
  async function discardPart(part: LineChange) {
    if (working.current || discarding === undefined) return;
    working.current = true;
    setBusyPart(partKey(part));
    setFailure(undefined);
    try {
      const reason = await discarding.run(await list.discardPart(file, part), {
        title: discardWords.partDiscarded,
        text: file.path,
      });
      setFailure(reason);
    } finally {
      working.current = false;
      setBusyPart(undefined);
    }
  }
  return (
    <section aria-label={discardWords.lines(file.path)} className="flex flex-col gap-2">
      {hunks.map((part) => (
        <div key={partKey(part)} className="flex items-start gap-3">
          <div className="flex-1">
            <PartHeading className="text-small text-fg-muted">{partHeading(part)}</PartHeading>
            <pre className="text-small overflow-x-auto rounded-md border border-border p-2">
              {part.removed.map((line, index) => (
                <span key={`-${index}`} className="block text-danger">
                  <span className="sr-only">{discardWords.removedLine} </span>
                  {`- ${line.replace(/\n$/u, "")}`}
                </span>
              ))}
              {part.added.map((line, index) => (
                <span key={`+${index}`} className="block text-success">
                  <span className="sr-only">{discardWords.addedLine} </span>
                  {`+ ${line.replace(/\n$/u, "")}`}
                </span>
              ))}
            </pre>
          </div>
          {discarding === undefined ? null : (
            <Button
              variant="ghost"
              size="sm"
              busy={busyPart !== undefined}
              onClick={() => void discardPart(part)}
            >
              {discardWords.discardThisPart}
            </Button>
          )}
        </div>
      ))}
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {discardWords.partFailed}. {failure}
        </span>
      )}
    </section>
  );
}
