import { type ChangeLine, type PartValue, partValueIn } from "@halonicjs/app";
import { useId } from "react";
import type { ChangedFile } from "../changes-list.ts";
import { versionWords } from "../changes-words.ts";

/**
 * What's in the version (save model 2.6): each file's changes with the Important ones first,
 * marked Important and always as before → after; the others as their sentence.
 */
export function WhatsInIt({ files }: { readonly files: readonly ChangedFile[] }) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="text-heading">
        {versionWords.whatsInIt}
      </h2>
      <ul className="flex flex-col gap-3">
        {files.map((file) => (
          <li key={file.path} className="flex flex-col gap-1">
            <h3 className="text-label break-all">{file.path}</h3>
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
      <p className="text-body">
        <span className="text-label text-fg-muted">{versionWords.important}</span> {line.sentence}
      </p>
      {file.texts === undefined
        ? null
        : line.parts.map((part) => (
            <div key={part.join("/")} className="grid grid-cols-2 gap-2">
              <Value
                title={versionWords.before}
                part={part.join(" › ")}
                value={partValueIn(file.texts?.before ?? null, part)}
              />
              <Value
                title={versionWords.after}
                part={part.join(" › ")}
                value={partValueIn(file.texts?.after ?? null, part)}
              />
            </div>
          ))}
    </div>
  );
}

function Value({
  title,
  part,
  value,
}: {
  readonly title: string;
  readonly part: string;
  readonly value: PartValue;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <span className="text-small text-fg-muted">
        {title}
        <span className="sr-only">: {part}</span>
      </span>
      <pre className="text-small whitespace-pre-wrap break-words">
        {value.found ? shown(value.value) : versionWords.notSet}
      </pre>
    </div>
  );
}

/** A value as the person would write it: text as it is, anything else as indented JSON. */
function shown(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
