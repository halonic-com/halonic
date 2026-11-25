// What a Build chat shows under a `read_docs` call (`assistant.build.site-card`): the docs log's
// line for it, and the site card when that call asked about a site.

import type { SavedChatDocs, SavedDocsSite } from "@halonicjs/ports";
import { Button } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useId, useState } from "react";
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
  const docs = useChatDocs(host, chatId);
  const entry = docs?.log.findLast((each) => each.callId === callId);
  const site = docs?.sites.find((each) => each.cardId === callId);
  return (
    <>
      {entry === undefined ? null : (
        <p className="pl-6 text-small text-fg-subtle wrap-break-word">{docsLogLine(entry)}</p>
      )}
      {site === undefined ? null : <SiteCard chatId={chatId} site={site} host={host} />}
    </>
  );
}

/**
 * The site card: the exact host, what allowing means, and **Allow** and **Don't allow** while it
 * waits. An `article` named by its question, with the proposal card's box (component specs 21.2).
 */
function SiteCard({
  chatId,
  site,
  host,
}: {
  readonly chatId: string;
  readonly site: SavedDocsSite;
  readonly host: AssistantHost;
}) {
  const questionId = useId();
  const [busy, setBusy] = useState<"allowed" | "declined">();
  const [failure, setFailure] = useState<string>();
  const answer = async (choice: "allowed" | "declined") => {
    if (busy !== undefined) return;
    setBusy(choice);
    setFailure(undefined);
    try {
      await host.answerSite(chatId, site.cardId, choice);
    } catch (error) {
      setFailure(words.cantAnswer(error instanceof Error ? error.message : String(error)));
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
      <p id={questionId} className="font-medium wrap-break-word">
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
        <p className="text-small">{site.answer === "allowed" ? words.allowed : words.declined}</p>
      )}
      {failure === undefined ? null : (
        <p role="alert" className="text-small text-danger">
          {failure}
        </p>
      )}
    </article>
  );
}

/** A chat's docs sites and log, read again each time the host says the chat changed. */
function useChatDocs(host: AssistantHost, chatId: string): SavedChatDocs | undefined {
  const [docs, setDocs] = useState<SavedChatDocs>();
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
    read();
    const stop = host.onDidChange((change) => {
      if (change.kind === "chat" && change.chatId === chatId) read();
    });
    return () => {
      live = false;
      stop();
    };
  }, [host, chatId]);
  return docs;
}
