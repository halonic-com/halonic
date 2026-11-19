import { type ChangeLine, type PartValue, partValueIn } from "@halonicjs/app";
import { Checkbox } from "@halonicjs/studio-kit";
import { useId } from "react";
import type { ChangeItem } from "../change-items.ts";
import type { ChangedFile } from "../changes-list.ts";
import { itemWords, versionWords } from "../changes-words.ts";
import { ItemIcon } from "./item-icon.tsx";
import { shownValue } from "./part-change.tsx";

/** Props for {@link WhatsInIt}. */
export interface WhatsInItProps {
  /** The items of the version, as the page lists them. */
  readonly items: readonly ChangeItem[];
  /** Whether this is the first version, which the history file was made for. */
  readonly first?: boolean;
  /** The ids of the items that go into the version. */
  readonly ticked: ReadonlySet<string>;
  readonly onTick: (id: string, on: boolean) => void;
}

const hasImportant = (file: ChangedFile) => file.description.lines.some((line) => line.important);

/**
 * What's in the version (save model 2.6): a row for each item, with the icon, name and kind the
 * page's list gives it, and a checkbox, ticked unless the person leaves it out. An item with an
 * Important setting comes first and has the Important chip at the right of its row; its Important
 * changes are always shown as before → after. An item with one plain change says it beside its
 * kind, so a short list is short.
 */
export function WhatsInIt({ items, first = false, ticked, onTick }: WhatsInItProps) {
  const headingId = useId();
  // Array.sort is stable, so the items keep their order within each group.
  const ordered = [...items].sort(
    (a, b) => Number(b.files.some(hasImportant)) - Number(a.files.some(hasImportant)),
  );
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {versionWords.whatsInIt}
      </h2>
      <ul className="flex flex-col gap-3">
        {ordered.map((item) => {
          const lines = item.files.flatMap((file) =>
            file.description.lines.map((line) => ({ file, line })),
          );
          const [only] = lines;
          const inline = lines.length === 1 && only?.line.important !== true;
          return (
            <li key={item.id} className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <ItemCheckbox
                  item={item}
                  ticked={ticked.has(item.id)}
                  onTick={(on) => onTick(item.id, on)}
                />
                {inline ? <InlineSentence item={item} sentence={only?.line.sentence} /> : null}
                <span className="flex-1" />
                {item.files.some(hasImportant) ? (
                  <span className="text-small shrink-0 rounded-full border border-border px-2 text-fg-muted">
                    {versionWords.important}
                  </span>
                ) : null}
              </div>
              {first && item.id === "file:.gitignore" ? (
                <p className="text-small text-fg-muted">{versionWords.addedByHistory}</p>
              ) : null}
              {inline ? null : (
                <ul className="flex flex-col gap-1">
                  {lines.map(({ file, line }) => (
                    <li key={`${file.path}:${line.id}`}>
                      {line.important === true ? (
                        <ImportantChange file={file} line={line} />
                      ) : (
                        <span className="text-body">{line.sentence}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * An item's checkbox, named by its icon, name and kind as the list shows them. The kind is part of
 * the name, so two items of one name sound different too.
 */
function ItemCheckbox({
  item,
  ticked,
  onTick,
}: {
  readonly item: ChangeItem;
  readonly ticked: boolean;
  readonly onTick: (on: boolean) => void;
}) {
  return (
    <Checkbox checked={ticked} onChange={onTick}>
      <span className="inline-flex items-center gap-2">
        <span className="inline-grid size-icon-md shrink-0 text-fg-muted *:size-full">
          <ItemIcon kind={item.kind} />
        </span>
        <span className="text-label break-words">{item.name}</span>
        {item.kind === undefined ? null : (
          <span className="text-body text-fg-muted">{itemWords.kind[item.kind]}</span>
        )}
      </span>
    </Checkbox>
  );
}

/** The one plain change of an item, beside its checkbox: "· New" after a kind. */
function InlineSentence({
  item,
  sentence = "",
}: {
  readonly item: ChangeItem;
  readonly sentence?: string | undefined;
}) {
  if (sentence === "") return null;
  return (
    <span className="text-body text-fg-muted">
      {item.kind === undefined ? sentence : itemWords.sentenceAfterKind(sentence)}
    </span>
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
