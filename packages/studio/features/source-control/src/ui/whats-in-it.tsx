import { type ChangeLine, type PartValue, partValueIn } from "@halonicjs/app";
import { Checkbox } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { ChangedFile } from "../changes-list.ts";
import { versionWords } from "../changes-words.ts";
import { shownValue } from "./part-change.tsx";

/** Props for {@link WhatsInIt}. */
export interface WhatsInItProps {
  readonly files: readonly ChangedFile[];
  /** The paths of the items that go into the version. */
  readonly ticked: ReadonlySet<string>;
  readonly onTick: (path: string, on: boolean) => void;
}

const hasImportant = (file: ChangedFile) => file.description.lines.some((line) => line.important);

/**
 * What's in the version (save model 2.6): a row for each item with a checkbox, ticked unless the
 * person leaves it out. An item with an Important setting comes first and has the Important chip
 * at the right of its row; its Important changes are always shown as before → after.
 */
export function WhatsInIt({ files, ticked, onTick }: WhatsInItProps) {
  const headingId = useId();
  // Array.sort is stable, so the items keep their order within each group.
  const ordered = [...files].sort((a, b) => Number(hasImportant(b)) - Number(hasImportant(a)));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {versionWords.whatsInIt}
      </h2>
      <ul className="flex flex-col gap-3">
        {ordered.map((file) => (
          <li key={file.path} className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Checkbox checked={ticked.has(file.path)} onChange={(on) => onTick(file.path, on)}>
                <span className="text-label break-all">{file.path}</span>
              </Checkbox>
              <span className="flex-1" />
              {hasImportant(file) ? (
                <span className="text-small shrink-0 rounded-full border border-border px-2 text-fg-muted">
                  {versionWords.important}
                </span>
              ) : null}
            </div>
            <ul className="flex flex-col gap-1">
              {file.description.lines.map((line) => (
                <li key={line.id}>
                  {line.important === true ? (
                    <ImportantChange file={file} line={line} />
                  ) : (
                    <span className="text-body">{line.sentence}</span>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** An Important change: its sentence, then each part it covers with its value before and after. */
function ImportantChange({
  file,
  line,
}: {
  readonly file: ChangedFile;
  readonly line: ChangeLine;
}) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-body">{line.sentence}</p>
      {file.texts === undefined
        ? null
        : line.parts.map((part) => (
            <div key={part.join("/")} className="flex flex-col gap-1">
              <span className="text-label">{partName(part)}</span>
              <div className="grid grid-cols-2 gap-2">
                <Value
                  old
                  title={versionWords.before}
                  value={partValueIn(file.texts?.before ?? null, part)}
                />
                <Value
                  title={versionWords.after}
                  value={partValueIn(file.texts?.after ?? null, part)}
                />
              </div>
            </div>
          ))}
    </div>
  );
}

/** One side of a part; the old one is struck through in `fg-muted`, with no warning colour. */
function Value({
  title,
  value,
  old = false,
}: {
  readonly title: string;
  readonly value: PartValue;
  readonly old?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-small text-fg-muted">{title}</span>
      <pre
        className={`text-small whitespace-pre-wrap break-words${old ? " text-fg-muted line-through" : ""}`}
      >
        {shownValue(value)}
      </pre>
    </div>
  );
}

/** A part's name over its before and after: its path, the first letter capital. */
function partName(part: readonly string[]): string {
  const name = part.join(" › ");
  return name.charAt(0).toUpperCase() + name.slice(1);
}
