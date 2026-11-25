import type { OpenUiComponent } from "@halonicjs/openui-lang";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "../button/button.tsx";
import { Card } from "../card/card.tsx";
import { ExternalLink } from "../external-link/external-link.tsx";
import { AgentButtons, AgentForm, type ChatUiSend } from "./chat-ui-controls.tsx";
import { list, prop, text } from "./chat-ui-values.ts";

/**
 * The components an agent may draw in a reply (HAL-17107 design), in grey: none of its parts gets
 * a status colour or an icon, so it can't draw something that looks like Studio's own approval,
 * warning or failure. Buttons and the form, which send a message, are in `chat-ui-controls.tsx`.
 */

/** A table shows this many rows until the person asks for all of them. */
export const CHAT_UI_ROWS_SHOWN = 20;

/** One part of a reply's `Stack`, by its type. A part it can't draw throws, for the boundary. */
export function ChatUiPart({
  part,
  onSend,
  answered,
}: {
  readonly part: OpenUiComponent;
  readonly onSend: ChatUiSend;
  readonly answered: string | undefined;
}) {
  switch (part.type) {
    case "Card":
      return <AgentCard part={part} />;
    case "Table":
      return <AgentTable part={part} />;
    case "Form":
      return <AgentForm part={part} onSend={onSend} answered={answered} />;
    case "Buttons":
      return <AgentButtons part={part} onSend={onSend} answered={answered} />;
    default:
      throw new TypeError(`Chat can't draw a ${part.type}.`);
  }
}

/** A link: its words, ↗, then the host from the address itself, never from the agent's words. */
function AgentLink({ part }: { readonly part: OpenUiComponent }) {
  const url = text(prop(part, "url"));
  return (
    <span title={url}>
      <ExternalLink href={url}>{text(prop(part, "label"))}</ExternalLink>{" "}
      <span className="whitespace-nowrap text-fg-muted">
        (<bdi dir="ltr">{new URL(url).host}</bdi>)
      </span>
    </span>
  );
}

function AgentCard({ part }: { readonly part: OpenUiComponent }) {
  const words = prop(part, "text");
  const facts = list<OpenUiComponent>(prop(part, "facts"));
  const links = list<OpenUiComponent>(prop(part, "links"));
  return (
    <Card title={text(prop(part, "title"))}>
      <div className="flex flex-col gap-3">
        {words === undefined ? null : <p className="text-fg">{text(words)}</p>}
        {facts.length === 0 ? null : (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-small">
            {facts.map((fact, index) => (
              <div key={index} className="contents">
                <dt className="text-fg-muted">{text(prop(fact, "label"))}</dt>
                <dd className="text-fg">{text(prop(fact, "value"))}</dd>
              </div>
            ))}
          </dl>
        )}
        {links.length === 0 ? null : (
          <ul className="flex flex-col gap-1 text-small">
            {links.map((link, index) => (
              <li key={index}>
                <AgentLink part={link} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

/**
 * The table in a bordered box that scrolls sideways on its own, so the reply never does. A
 * column of numbers is right-aligned. **Show all** is Studio's own control, not the agent's.
 */
function AgentTable({ part }: { readonly part: OpenUiComponent }) {
  const captionId = useId();
  const [all, setAll] = useState(false);
  // **Show all** removes itself, so focus moves to the first row it showed instead of the page.
  const firstNewRow = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (all) firstNewRow.current?.focus();
  }, [all]);
  const columns = list(prop(part, "columns"));
  const rows = list<OpenUiComponent>(prop(part, "rows")).map((row) => list(prop(row, "cells")));
  const shown = all ? rows : rows.slice(0, CHAT_UI_ROWS_SHOWN);
  const align = columns.map((_, index) =>
    rows.every((cells) => typeof cells[index] === "number")
      ? "text-end tabular-nums"
      : "text-start",
  );
  const caption = text(prop(part, "caption"));
  return (
    <div className="flex flex-col gap-2">
      {caption === "" ? null : (
        <p id={captionId} className="text-small font-medium text-fg">
          {caption}
        </p>
      )}
      <div className="overflow-auto rounded-sm border border-border">
        <table
          aria-labelledby={caption === "" ? undefined : captionId}
          className="w-full border-collapse text-small text-fg"
        >
          <thead className="bg-surface-subtle text-fg-muted">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={index}
                  scope="col"
                  className={`px-3 py-1.5 font-normal whitespace-nowrap ${align[index]}`}
                >
                  {text(column)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((cells, row) => (
              <tr
                key={row}
                ref={row === CHAT_UI_ROWS_SHOWN ? firstNewRow : undefined}
                tabIndex={row === CHAT_UI_ROWS_SHOWN ? -1 : undefined}
                className="border-t border-border"
              >
                {columns.map((_, index) => (
                  <td key={index} className={`px-3 py-1.5 align-top ${align[index]}`}>
                    {text(cells[index])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {shown.length === rows.length ? null : (
        <ShowAll shown={shown.length} total={rows.length} onShowAll={() => setAll(true)} />
      )}
    </div>
  );
}

interface ShowAllProps {
  readonly shown: number;
  readonly total: number;
  readonly onShowAll: () => void;
}

/** "Showing 20 of 48 rows." and Studio's own button that shows the rest. */
function ShowAll({ shown, total, onShowAll }: ShowAllProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span className="text-small text-fg-muted">
        Showing {shown} of {total} rows.
      </span>
      <Button variant="ghost" size="sm" onClick={onShowAll}>
        Show all {total}
      </Button>
    </div>
  );
}
