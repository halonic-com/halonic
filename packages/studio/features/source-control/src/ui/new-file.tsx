import { type ItemField, newItemFields } from "@halonicjs/app";
import type { ChangedFile } from "../changes-list.ts";
import { discardWords, itemWords, mergeWords } from "../changes-words.ts";
import { shownValue } from "./part-change.tsx";

// A new file on its What changed page: a new item's fields and, under Advanced, its whole file;
// any other new file's first lines.

/** A new item's fields, when the file is new and reads as its kind; `undefined` otherwise. */
export function fieldsOfNew(file: ChangedFile): readonly ItemField[] | undefined {
  const { texts } = file;
  if (texts?.before !== null || texts.after === null) return undefined;
  const fields = newItemFields(file.path, texts.after);
  return fields === undefined || fields.length === 0 ? undefined : fields;
}

/**
 * A new item, shown the way an edited one is: "New skill", then each of its fields with its label
 * and value. The file itself is under Advanced.
 */
export function NewItemFields({
  file,
  fields,
}: {
  readonly file: ChangedFile;
  readonly fields: readonly ItemField[];
}) {
  const { kind } = file.description;
  return (
    <div className="flex flex-col gap-2">
      {kind === undefined ? null : (
        <p className="text-label">{itemWords.newOfKind(itemWords.kind[kind])}</p>
      )}
      <dl className="flex flex-col gap-2">
        {fields.map((field) => (
          <div key={field.key} className="flex flex-col gap-0.5">
            <dt className="text-label text-fg-muted">{field.label}</dt>
            <dd className="text-body whitespace-pre-wrap break-words">
              {shownValue({ found: true, value: field.value })}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** A new file's whole text, under Advanced. */
export function WholeFile({ file }: { readonly file: ChangedFile }) {
  return (
    <section aria-label={discardWords.wholeFile(file.path)}>
      <pre className="text-small overflow-x-auto rounded-md border border-border p-2">
        {file.texts?.after}
      </pre>
    </section>
  );
}

/** How many lines of a new file are shown, so the person can tell what they would discard. */
const previewLines = 8;

/** The first lines of a file that is new; nothing for any other file. */
export function NewFileLines({ file }: { readonly file: ChangedFile }) {
  const text = file.texts?.before === null ? file.texts.after : null;
  if (text === null || text === undefined || text.trim() === "") return null;
  const lines = text.replace(/\n$/u, "").split("\n");
  const rest = lines.length - previewLines;
  return (
    <section aria-label={discardWords.firstLines(file.path)} className="flex flex-col gap-1">
      <pre className="text-small overflow-x-auto rounded-md border border-border p-2">
        {lines.slice(0, previewLines).join("\n")}
      </pre>
      {rest > 0 ? (
        <span className="text-small text-fg-muted">{mergeWords.moreLines(rest)}</span>
      ) : null}
    </section>
  );
}
