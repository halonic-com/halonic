import { Button, Callout, Field, TextArea } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { KnowledgeModel, SummarizeState } from "../knowledge-model.ts";
import { knowledgeWords } from "../knowledge-words.ts";

interface SummaryFieldProps {
  readonly model: KnowledgeModel;
  readonly name: string;
  readonly summary: string;
  readonly summarize: SummarizeState;
  /** Reads a state change to screen readers. */
  readonly announce: (text: string) => void;
  /** Opens Models, where a local model is set up; absent when the window has no way to. */
  readonly openModels: (() => void) | undefined;
  /** The words for "the engine isn't answering" in this window (desktop app, served browser or phone). */
  readonly notAnswering: string;
}

/**
 * The Summary row (flow-library 5.2): the text with **Summarize** and **Remove summary**; asking
 * drafts a summary in an editable box with **Use this summary** and **Discard**. Nothing is drafted
 * until the person asks. Errors sit under the row, never as a toast.
 */
export function SummaryField({
  model,
  name,
  summary,
  summarize,
  announce,
  openModels,
  notAnswering,
}: SummaryFieldProps) {
  const ask = useRef<HTMLButtonElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState("");
  const drafted = summarize.phase === "draft";
  const draftText = summarize.phase === "draft" ? summarize.text : "";

  // A new draft fills the box, takes focus and is read out.
  useEffect(() => {
    if (!drafted) return;
    setText(draftText);
    box.current?.focus();
    announce(knowledgeWords.draftReady);
  }, [drafted, draftText, announce]);

  // Use and Discard return focus to Summarize (accessibility pass 9.3).
  const backToAsk = () => ask.current?.focus();

  return (
    <Field label={knowledgeWords.summary} align="text">
      <p className="[overflow-wrap:anywhere]">{summary || knowledgeWords.noSummary}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={ask}
          variant="secondary"
          size="sm"
          busy={summarize.phase === "working"}
          busyLabel={knowledgeWords.summarizing}
          onClick={() => void model.summarize()}
        >
          {knowledgeWords.summarize}
        </Button>
        {summary === "" ? null : (
          <Button variant="ghost" size="sm" onClick={() => void model.save({ summary: null })}>
            {knowledgeWords.removeSummary}
          </Button>
        )}
      </div>
      {summarize.phase === "failed" ? (
        <Problem
          reason={summarize.reason}
          name={name}
          openModels={openModels}
          notAnswering={notAnswering}
          tryAgain={() => void model.summarize()}
        />
      ) : null}
      {drafted ? (
        <div className="flex flex-col gap-2">
          <Field label={knowledgeWords.draft}>
            <TextArea ref={box} value={text} onChange={(event) => setText(event.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={() => void model.useDraft(text).then((saved) => saved && backToAsk())}
            >
              {knowledgeWords.useDraft}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                model.discardDraft();
                backToAsk();
              }}
            >
              {knowledgeWords.discard}
            </Button>
          </div>
        </div>
      ) : null}
    </Field>
  );
}

function Problem({
  reason,
  name,
  openModels,
  tryAgain,
  notAnswering,
}: {
  readonly reason: Exclude<SummarizeState, { phase: "idle" | "working" | "draft" }>["reason"];
  readonly name: string;
  readonly openModels: (() => void) | undefined;
  readonly tryAgain: () => void;
  readonly notAnswering: string;
}) {
  if (reason === "no-local-model") {
    return (
      <Callout
        tone="danger"
        {...(openModels === undefined
          ? {}
          : { action: { label: knowledgeWords.models, onClick: openModels } })}
      >
        {knowledgeWords.needsLocalModel}
      </Callout>
    );
  }
  if (reason === "no-documents") {
    return <Callout tone="danger">{knowledgeWords.noDocuments(name)}</Callout>;
  }
  if (reason === "too-large") {
    return (
      <Callout tone="danger">
        {knowledgeWords.summarizeFailed(name, knowledgeWords.tooLarge)}
      </Callout>
    );
  }
  const why =
    reason === "host-unreachable"
      ? knowledgeWords.hostUnreachable(notAnswering)
      : knowledgeWords.modelFailed;
  return (
    <Callout tone="danger" action={{ label: knowledgeWords.tryAgain, onClick: tryAgain }}>
      {knowledgeWords.summarizeFailed(name, why)}
    </Callout>
  );
}
