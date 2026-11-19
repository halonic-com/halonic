import type { LineChange } from "@halonicjs/std";
import { diffLines } from "@halonicjs/std";
import {
  ActionBar,
  Button,
  LineFrame,
  TickIcon,
  useToastStore,
  WarningIcon,
} from "@halonicjs/studio-kit";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { UpdateChoice, UpdateItem } from "../api.ts";
import type { ChangesList } from "../changes-list.ts";
import { mergeWords, pageWords } from "../changes-words.ts";

/** The lines of a side's text a tile shows before it cuts. */
const previewLines = 8;

/**
 * The strip a half-done Get updates leaves (checklist part 2, 2.3 and 2.8): "You're in the middle
 * of getting Sam's updates." with Continue, which brings the choices back as they were left.
 */
export function MergeStrip({ list }: { readonly list: ChangesList }) {
  const people = list.state.merge?.people ?? [];
  return (
    <LineFrame
      icon={<WarningIcon />}
      action={{ label: mergeWords.continue, onClick: () => list.merge.continue() }}
    >
      {mergeWords.inTheMiddle(people)}
    </LineFrame>
  );
}

/**
 * Choosing for each item both sides changed (checklist part 2, 2.8): the changed lines, then
 * Keep mine, Use Sam's and, where both sides still have the item, Keep both, with neither as
 * the default. Finish getting updates waits until every item is chosen; Cancel puts it all back.
 *
 * On a phone (2.14) it is its own page in place of the Changes page: Back to Changes keeps the
 * merge started, the tiles are stacked with Yours first, and "Choose for 1 more item.", Finish
 * and Cancel are the bottom bar.
 */
export function MergeChoices({
  list,
  phone,
}: {
  readonly list: ChangesList;
  readonly phone: boolean;
}) {
  const { merge, mergeBusy } = list.state;
  const toasts = useToastStore();
  const heading = useRef<HTMLHeadingElement>(null);
  const descriptionId = useId();
  const [failure, setFailure] = useState<string>();
  // Which of Finish and Cancel is running, so the phone's bar marks only that one busy.
  const [ending, setEnding] = useState<"finish" | "cancel">();
  useEffect(() => heading.current?.focus(), []);
  if (merge === undefined) return null;
  const left = merge.items.filter((item) => item.choice === undefined).length;

  async function finish() {
    setFailure(undefined);
    setEnding("finish");
    const reason = await list.merge.finish();
    setEnding(undefined);
    if (reason !== undefined) return setFailure(`${mergeWords.finishFailed}. ${reason}`);
    toasts?.show({ tone: "success", title: mergeWords.merged(merge?.people ?? []) });
  }
  async function cancel() {
    setFailure(undefined);
    setEnding("cancel");
    const reason = await list.merge.cancel();
    setEnding(undefined);
    if (reason !== undefined) return setFailure(`${mergeWords.cancelFailed}. ${reason}`);
    toasts?.show({ tone: "success", title: mergeWords.cancelled });
  }

  const titleId = `${descriptionId}-title`;
  const body = (
    <>
      <p className="text-body">{mergeWords.intro(merge.people, merge.items.length)}</p>
      <ul className="flex flex-col gap-4">
        {merge.items.map((item) => (
          <li key={item.path}>
            <ItemChoice list={list} item={item} people={merge.people} phone={phone} />
          </li>
        ))}
      </ul>
    </>
  );
  const failed =
    failure === undefined ? null : (
      <span role="alert" className="text-small text-danger">
        {failure}
      </span>
    );
  const waiting = (
    <span id={descriptionId} className="text-small text-fg-muted empty:hidden">
      {left > 0 ? mergeWords.chooseForMore(left) : null}
    </span>
  );

  if (phone) {
    return (
      <section aria-labelledby={titleId} className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col gap-4 p-4">
          <span className="self-start">
            <Button variant="ghost" size="touch" onClick={() => list.merge.leave()}>
              {pageWords.back}
            </Button>
          </span>
          <h1 id={titleId} ref={heading} tabIndex={-1} className="text-title focus-ring">
            {mergeWords.heading}
          </h1>
          {body}
          {failed}
        </div>
        <ActionBar
          whileTyping="hide"
          lead={waiting}
          rows={[
            [
              {
                label: mergeWords.finish,
                variant: "primary",
                busy: ending === "finish",
                unavailable: left > 0 ? { reason: descriptionId } : undefined,
                onClick: () => void finish(),
              },
            ],
            [{ label: mergeWords.cancel, busy: ending === "cancel", onClick: () => void cancel() }],
          ]}
        />
      </section>
    );
  }
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <h2 id={titleId} ref={heading} tabIndex={-1} className="text-heading focus-ring">
        {mergeWords.heading}
      </h2>
      {body}
      <div className="flex flex-row flex-wrap items-center gap-3">
        <Button
          variant="primary"
          size="sm"
          busy={mergeBusy}
          unavailable={left > 0 ? { reason: descriptionId } : undefined}
          onClick={() => void finish()}
        >
          {mergeWords.finish}
        </Button>
        <Button variant="ghost" size="sm" busy={mergeBusy} onClick={() => void cancel()}>
          {mergeWords.cancel}
        </Button>
        {waiting}
      </div>
      {failed}
    </section>
  );
}

/** One item: what differs, then a tile for each way to settle it, or what was chosen. */
function ItemChoice({
  list,
  item,
  people,
  phone,
}: {
  readonly list: ChangesList;
  readonly item: UpdateItem;
  readonly people: readonly string[];
  readonly phone: boolean;
}) {
  const busy = list.state.mergeBusy;
  const [failure, setFailure] = useState<string>();
  const chosen = useRef<HTMLParagraphElement>(null);
  // Which button was used, so Undo can give focus back to it.
  const used = useRef<UpdateChoice | undefined>(undefined);
  const buttons = useRef(new Map<UpdateChoice, HTMLButtonElement>());
  const changes = useMemo(() => diffLines(item.mine ?? "", item.theirs ?? ""), [item]);
  const canBoth = item.mine !== null && item.theirs !== null;
  const done = item.choice !== undefined;
  // One level under the page's heading: an h1 on a phone's own page, an h2 on the Changes page.
  const ItemHeading = phone ? "h2" : "h3";

  // Focus follows what changed: to "Keeping yours" after a choice, to the button used after Undo.
  const wasDone = useRef(done);
  useEffect(() => {
    if (done && !wasDone.current) chosen.current?.focus();
    if (!done && wasDone.current && used.current !== undefined) {
      buttons.current.get(used.current)?.focus();
    }
    wasDone.current = done;
  }, [done]);

  async function choose(choice: UpdateChoice) {
    setFailure(undefined);
    used.current = choice;
    const reason = await list.merge.choose(item.path, choice);
    if (reason !== undefined) setFailure(`${mergeWords.choiceFailed}. ${reason}`);
  }
  async function undo() {
    setFailure(undefined);
    const reason = await list.merge.undo(item.path);
    if (reason !== undefined) setFailure(`${mergeWords.choiceFailed}. ${reason}`);
  }
  const keep = (choice: UpdateChoice, label: string) => (
    <Button
      variant="secondary"
      size={phone ? "touch" : "sm"}
      block
      busy={busy}
      ref={(button: HTMLButtonElement | null) => {
        if (button === null) buttons.current.delete(choice);
        else buttons.current.set(choice, button);
      }}
      onClick={() => void choose(choice)}
    >
      {label}
    </Button>
  );
  return (
    <section aria-label={item.path} className="flex flex-col gap-2">
      <ItemHeading className="text-label break-all">{item.path}</ItemHeading>
      <Changes changes={changes} />
      <div className={`flex gap-4 ${phone ? "flex-col" : "flex-row items-stretch"}`}>
        <Tile
          title={mergeWords.yours}
          text={item.mine}
          state={tileState(item.choice, "mine")}
          chosenLabel={mergeWords.keepingYours}
          chosenRef={chosen}
          undo={() => void undo()}
          busy={busy}
          action={keep("mine", mergeWords.keepMine)}
          notUsed={item.choice === "both" ? mergeWords.yours : undefined}
          phone={phone}
        />
        <Tile
          title={mergeWords.theirsName(people)}
          text={item.theirs}
          state={tileState(item.choice, "theirs")}
          chosenLabel={mergeWords.keepingTheirs(people)}
          chosenRef={chosen}
          undo={() => void undo()}
          busy={busy}
          action={keep("theirs", mergeWords.useTheirs(people))}
          notUsed={
            item.choice === "both" ? mergeWords.theirsName(people) : mergeWords.notUsed(people)
          }
          phone={phone}
        />
        {canBoth ? (
          <Tile
            title={mergeWords.keepBoth}
            text={undefined}
            state={tileState(item.choice, "both")}
            chosenLabel={mergeWords.keepingBoth}
            chosenRef={chosen}
            undo={() => void undo()}
            busy={busy}
            action={keep("both", mergeWords.keepBoth)}
            note={item.copy === undefined ? undefined : mergeWords.copySavedAs(item.copy)}
            notUsed={mergeWords.keepBoth}
            phone={phone}
          />
        ) : null}
      </div>
      {failure === undefined ? null : (
        <span role="alert" className="text-small text-danger">
          {failure}
        </span>
      )}
    </section>
  );
}

type TileState = "open" | "chosen" | "unused";

/** A tile is open while nothing is chosen; then the chosen one keeps its box and the rest fold. */
function tileState(choice: UpdateChoice | undefined, tile: UpdateChoice): TileState {
  if (choice === undefined) return "open";
  return choice === tile ? "chosen" : "unused";
}

function Tile({
  title,
  text,
  state,
  chosenLabel,
  chosenRef,
  undo,
  busy,
  action,
  note,
  notUsed,
  phone,
}: {
  readonly title: string;
  /** The side's text; `null` for a side that deleted the item, `undefined` for a tile with no text. */
  readonly text: string | null | undefined;
  readonly state: TileState;
  readonly chosenLabel: string;
  readonly chosenRef: React.Ref<HTMLParagraphElement>;
  readonly undo: () => void;
  readonly busy: boolean;
  readonly action: React.ReactNode;
  readonly note?: string | undefined;
  readonly notUsed?: string | undefined;
  readonly phone: boolean;
}) {
  const TileHeading = phone ? "h3" : "h4";
  if (state === "unused") {
    return (
      <div className="text-small text-fg-muted flex flex-1 items-start rounded-md border border-border p-3">
        {notUsed ?? `${title}: not used`}
      </div>
    );
  }
  return (
    <div className="flex flex-1 flex-col gap-2 rounded-md border border-border p-3">
      <TileHeading className="text-label text-fg-muted">{title}</TileHeading>
      {text === undefined ? null : <Preview text={text} />}
      {state === "open" ? (
        action
      ) : (
        <div className="flex flex-col gap-1">
          <p ref={chosenRef} tabIndex={-1} className="text-body flex items-center gap-2 focus-ring">
            <span aria-hidden="true" className="inline-grid size-icon-sm place-items-center">
              <TickIcon />
            </span>
            {chosenLabel}
          </p>
          {note === undefined ? null : <p className="text-small text-fg-muted">{note}</p>}
          <Button variant="ghost" size="sm" busy={busy} onClick={undo}>
            {mergeWords.undo}
          </Button>
        </div>
      )}
    </div>
  );
}

/** A side's text, cut after a few lines. */
function Preview({ text }: { readonly text: string | null }) {
  if (text === null) return <p className="text-small text-fg-muted">{mergeWords.deleted}</p>;
  const lines = text.replace(/\n$/u, "").split("\n");
  const rest = lines.length - previewLines;
  return (
    <pre className="text-small overflow-x-auto whitespace-pre-wrap break-words">
      {lines.slice(0, previewLines).join("\n")}
      {rest > 0 ? `\n… ${mergeWords.moreLines(rest)}` : ""}
    </pre>
  );
}

/** The changed lines between the two sides, as the Changes page's line diff shows them. */
function Changes({ changes }: { readonly changes: readonly LineChange[] }) {
  if (changes.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {changes.map((part) => (
        <pre
          key={`${part.beforeStart}:${part.afterStart}`}
          className="text-small overflow-x-auto rounded-md border border-border p-2"
        >
          {part.removed.map((line, index) => (
            <span key={`-${index}`} className="block text-danger">
              {`- ${line.replace(/\n$/u, "")}`}
            </span>
          ))}
          {part.added.map((line, index) => (
            <span key={`+${index}`} className="block text-success">
              {`+ ${line.replace(/\n$/u, "")}`}
            </span>
          ))}
        </pre>
      ))}
    </div>
  );
}
