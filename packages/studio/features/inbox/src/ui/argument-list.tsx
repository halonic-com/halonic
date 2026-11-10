import { Button } from "@halonicjs/studio-kit";
import { useState } from "react";
import { type ArgumentField, argumentFields, rawJson } from "../plain/argument-fields.ts";
import { markedName } from "../plain/hidden-characters.ts";
import { PlainValue } from "./plain-value.tsx";

export interface ArgumentListProps {
  readonly args: unknown;
  /** The tool's name, which screen readers hear in the raw JSON button: "Show raw JSON for create_note". */
  readonly tool: string;
}

/** One level of nesting, in the card's 16px steps. */
const indentPerLevel = 16;

/**
 * Every argument the agent sent, as a description list of `name: value` fields
 * (`inbox.argument-fields`), then **Show raw JSON** with the exact arguments.
 */
export function ArgumentList({ args, tool }: ArgumentListProps) {
  const [raw, setRaw] = useState(false);
  const fields = argumentFields(args);
  return (
    <div className="flex flex-col gap-2">
      <dl className="flex flex-col gap-2">
        {fields.map((field, index) => (
          <Field key={index} field={field} />
        ))}
      </dl>
      <div className="-ml-2.5">
        <Button variant="ghost" size="sm" aria-expanded={raw} onClick={() => setRaw(!raw)}>
          Show raw JSON<span className="sr-only">{` for ${markedName(tool)}`}</span>
        </Button>
      </div>
      {raw ? (
        // A focusable block, so a keyboard can scroll it; it holds no control, so Tab moves on.
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area must take focus to scroll by keyboard
          tabIndex={0}
          className="focus-ring max-h-96 overflow-auto rounded-sm border border-border bg-surface-subtle p-3 font-mono text-code whitespace-pre-wrap wrap-anywhere text-fg"
        >
          <code>{rawJson(args)}</code>
        </pre>
      ) : null}
    </div>
  );
}

function Field({ field }: { readonly field: ArgumentField }) {
  const style = { paddingInlineStart: `${field.depth * indentPerLevel}px` };
  const { value } = field;
  return (
    <div style={style} className="min-w-0">
      {field.name === "" ? null : (
        <dt className="font-mono text-code text-fg-muted">
          <FieldName name={field.name} />
        </dt>
      )}
      <dd className="min-w-0 text-body">
        {value.kind === "text" ? (
          <PlainValue text={value.text} />
        ) : (
          <span className={value.kind === "literal" ? "text-fg" : "text-fg-muted"}>
            {value.text}
          </span>
        )}
      </dd>
    </div>
  );
}

/** An argument's name is the agent's too, so it gets markers like a value. */
function FieldName({ name }: { readonly name: string }) {
  return <bdi>{markedName(name)}</bdi>;
}
