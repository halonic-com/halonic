// What a Build chat shows under a `read_docs` call (`assistant.build.site-card`): the docs log's
// line for it, and the site card when that call asked about a site.

import type { SavedChatDocs, SavedDocsLogEntry, SavedDocsSite } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { AlertIcon, Button } from "@halonicjs/studio-kit";
import { failureLine, type WorkspaceContext } from "@halonicjs/studio-shell";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { type AssistantHost, AssistantHostService } from "../api.ts";
import { cardElementId } from "./card-end.tsx";
import { docsLogLine, siteCardWords as words } from "./site-card-words.ts";

/** Props for {@link DocsCall}. */
export interface DocsCallProps {
  readonly chatId: string;
  /** The `read_docs` call's id: its log line names it, and so does the card it asked for. */
  readonly callId: string;
  readonly context: WorkspaceContext;
}

/** The log line under one `read_docs` call, and its site card when it asked about a site. */
export function DocsCall({ chatId, callId, context }: DocsCallProps) {
  const host = context.services.get(AssistantHostService);
  const { docs, reread } = useChatDocs(host, chatId);
  const entry = docs?.log.findLast((each) => each.callId === callId);
  const site = docs?.sites.find((each) => each.cardId === callId);
  return (
    <>
      {entry === undefined || !stillTrue(entry, docs?.sites ?? []) ? null : (
        <p className="pl-6 text-small text-fg-subtle wrap-break-word">{docsLogLine(entry)}</p>
      )}
      {site === undefined ? null : (
        <SiteCard chatId={chatId} site={site} host={host} reread={reread} />
      )}
    </>
  );
}

/**
 * Whether a log line still says what is true: a call's "waiting" line goes once its site has an
 * answer, because the card's answered line then says what happened (design check, HAL-18543).
 */
function stillTrue(entry: SavedDocsLogEntry, sites: readonly SavedDocsSite[]): boolean {
  if (entry.outcome !== "waiting") return true;
  const host = hostOf(entry.url);
  return sites.some((site) => site.host === host && site.answer === "asked");
}

function hostOf(url: string): string | undefined {
  try {
    return new URL(url).hostname;
  } catch {
    return undefined;
  }
}

/**
 * The site card: the exact host, what allowing means, and **Allow** and **Don't allow** while it
 * waits. An `article` named by its question, with the proposal card's box (component specs 21.2).
 */
function SiteCard({
  chatId,
  site,
  host,
  reread,
}: {
  readonly chatId: string;
  readonly site: SavedDocsSite;
  readonly host: AssistantHost;
  /** Reads the chat's docs again, for a card answered elsewhere. */
  readonly reread: () => void;
}) {
  const questionId = useId();
  const [busy, setBusy] = useState<"allowed" | "declined">();
  const [failure, setFailure] = useState<string>();
  const line = useAnswerFocus(site.answer);
  const answer = async (choice: "allowed" | "declined") => {
    if (busy !== undefined) return;
    setBusy(choice);
    setFailure(undefined);
    // Set before the call: the host may report the new answer before the call returns.
    line.answeredHere.current = true;
    try {
      await host.answerSite(chatId, site.cardId, choice);
    } catch (error) {
      line.answeredHere.current = false;
      // Answered already, such as in another window: the card shows the kept answer instead.
      if (errorKindOf(error) === "conflict") reread();
      else setFailure(failureLine(words.saveAnswer, error));
    } finally {
      setBusy(undefined);
    }
  };
  return (
    <article
      id={cardElementId({ chatId, cardId: site.cardId })}
      aria-labelledby={questionId}
      className="flex flex-col gap-1 rounded-md border border-border bg-surface p-3 text-body"
    >
      <p id={questionId} className="text-body-strong wrap-break-word">
        {words.question(site.host)}
      </p>
      <p className="text-small text-fg-muted">{words.line}</p>
      {site.answer === "asked" ? (
        <div className="mt-1 flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            busy={busy === "allowed"}
            onClick={() => void answer("allowed")}
          >
            {words.allow}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            busy={busy === "declined"}
            onClick={() => void answer("declined")}
          >
            {words.dontAllow}
          </Button>
        </div>
      ) : (
        <p ref={line.ref} tabIndex={-1} className="text-small focus-ring">
          {site.answer === "allowed" ? words.allowed : words.declined}
        </p>
      )}
      {failure === undefined ? null : (
        <p role="alert" className="flex items-start gap-1 text-caption text-danger">
          <span className="inline-grid size-icon-sm shrink-0 place-items-center *:size-full">
            <AlertIcon />
          </span>
          {failure}
        </p>
      )}
    </article>
  );
}

/**
 * Once the card is answered from its own buttons, focus moves to the line that replaced them, so a
 * keyboard user isn't left on the page's body (component specs 21.2, as the proposal card does).
 */
function useAnswerFocus(answer: SavedDocsSite["answer"]) {
  const ref = useRef<HTMLParagraphElement>(null);
  const answeredHere = useRef(false);
  useEffect(() => {
    if (answer === "asked" || !answeredHere.current) return;
    answeredHere.current = false;
    ref.current?.focus();
  }, [answer]);
  return { ref, answeredHere };
}

/**
 * A chat's docs sites and log, read again each time the host says the chat changed, and
 * `reread` to read them again now.
 */
function useChatDocs(
  host: AssistantHost,
  chatId: string,
): { readonly docs: SavedChatDocs | undefined; readonly reread: () => void } {
  const [docs, setDocs] = useState<SavedChatDocs>();
  const readNow = useRef<() => void>(() => undefined);
  const reread = useCallback(() => readNow.current(), []);
  useEffect(() => {
    let live = true;
    let latest = 0;
    const read = () => {
      latest += 1;
      const asked = latest;
      host.chatDocs(chatId).then(
        (read) => {
          if (live && asked === latest) setDocs(read);
        },
        // A chat that's gone shows nothing under its calls.
        () => undefined,
      );
    };
    readNow.current = read;
    read();
    const stop = host.onDidChange((change) => {
      if (change.kind === "chat" && change.chatId === chatId) read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [host, chatId]);
  return { docs, reread };
}
