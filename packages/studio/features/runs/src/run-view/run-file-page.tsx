import { shortRunId } from "@halonicjs/app";
import { escapeHidden } from "@halonicjs/std";
import { EmptyState, List, usePresentation } from "@halonicjs/studio-kit";
import {
  type EngineWords,
  engineWordsOf,
  type ItemViewProps,
  PageBackLinkSlot,
} from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { type RunFiles, RunFilesService, type RunsSource } from "../api.ts";
import { FailureReason } from "../load-failure.tsx";
import { runPageWords } from "../run-words.ts";
import { RunsListService } from "../runs-list.ts";
import { runFileOf } from "./run-file-ref.ts";
import { runFileWords } from "./run-file-words.ts";

/** The `run-file` item kind's page: a file a run saved, read-only (HAL-17831). */
export function RunFilePage({ item, context }: ItemViewProps) {
  const { runId, name } = runFileOf(item.id);
  const files = context.services.find(RunFilesService);
  return (
    <RunFileView
      source={context.services.get(RunsListService).source}
      files={files}
      runId={runId}
      name={name}
      engine={engineWordsOf(context)}
    />
  );
}

/** Props for {@link RunFileView}. */
export interface RunFileViewProps {
  readonly source: Pick<RunsSource, "log">;
  /** Reads the file's bytes; absent where the app can't, and the page says it couldn't read it. */
  readonly files: RunFiles | undefined;
  readonly runId: string;
  /** The file's name as the run's log has it. */
  readonly name: string;
  readonly engine?: EngineWords;
}

/**
 * A file a run saved, as plain text in a frame nobody can type in: no Markdown is drawn, a link or
 * image in it shows as text and loads nothing, and every hidden or direction-changing character
 * is written as its `\uXXXX` escape, the dashed frame's rules (RCPT-3.4). The text is the last
 * file of that name the run's log names.
 */
export function RunFileView({
  source,
  files,
  runId,
  name,
  engine = engineWordsOf({}),
}: RunFileViewProps) {
  const phone = usePresentation() === "phone";
  const [read, retry] = useRunFile(source, files, runId, name);
  const shown = escapeHidden(name);
  return (
    <div className={`flex w-full min-w-0 flex-col gap-4 ${phone ? "px-4 py-4" : "px-6 py-5"}`}>
      <PageBackLinkSlot />
      <header className="flex flex-col gap-1">
        <h1 className="text-title wrap-anywhere">{shown}</h1>
        <p className="text-small text-fg-muted">
          {runFileWords.savedBy(runPageWords.title(shortRunId(runId)))}
        </p>
      </header>
      <FileBody read={read} retry={retry} name={shown} engine={engine} />
    </div>
  );
}

function FileBody({
  read,
  retry,
  name,
  engine,
}: {
  readonly read: FileRead;
  readonly retry: () => void;
  readonly name: string;
  readonly engine: EngineWords;
}) {
  switch (read.state) {
    case "loading":
      return (
        <List
          label={runFileWords.loading(name)}
          rows={[]}
          loading
          loadingLabel={runFileWords.loading(name)}
        />
      );
    case "gone":
    case "not-in-run":
      return (
        <EmptyState
          plain
          title={read.state === "gone" ? runFileWords.gone : runFileWords.notInRun}
        />
      );
    case "failed":
      return (
        <EmptyState
          tone="error"
          align="start"
          title={runFileWords.readFailed(name)}
          description={
            <FailureReason
              what={runFileWords.readFailed(name)}
              error={read.error}
              engine={engine}
            />
          }
          action={{ label: "Try again", onClick: retry }}
        />
      );
    case "read":
      return (
        // A `pre` holds no field to type in. It takes focus so a keyboard can scroll it; it holds no
        // control, so Tab moves on.
        <pre
          // biome-ignore lint/a11y/noNoninteractiveTabindex: a scroll area must take focus to scroll by keyboard
          tabIndex={0}
          className="focus-ring max-w-full overflow-auto rounded-sm border border-border p-3 font-mono text-small whitespace-pre-wrap wrap-anywhere"
        >
          {read.text}
        </pre>
      );
  }
}

/** Where reading the file stands. */
export type FileRead =
  | { readonly state: "loading" }
  | { readonly state: "read"; readonly text: string }
  /** The log names the file, but its bytes aren't kept any more. */
  | { readonly state: "gone" }
  | { readonly state: "not-in-run" }
  | { readonly state: "failed"; readonly error: unknown };

/** Reads the file once per run and name, and again on Try again. */
function useRunFile(
  source: Pick<RunsSource, "log">,
  files: RunFiles | undefined,
  runId: string,
  name: string,
): [FileRead, () => void] {
  const [attempt, setAttempt] = useState(0);
  const [read, setRead] = useState<FileRead>({ state: "loading" });
  useEffect(() => {
    let current = true;
    setRead({ state: "loading" });
    readRunFile(source, files, runId, name).then(
      (next) => current && setRead(next),
      (error: unknown) => current && setRead({ state: "failed", error }),
    );
    return () => {
      current = false;
    };
  }, [source, files, runId, name, attempt]);
  return [read, () => setAttempt((count) => count + 1)];
}

/**
 * A run's saved file as the page shows it: the bytes of the last `artifact.created` of that name
 * in the run's log, read as UTF-8 (the engine saves the answer's UTF-8 bytes), with hidden
 * characters escaped.
 */
export async function readRunFile(
  source: Pick<RunsSource, "log">,
  files: RunFiles | undefined,
  runId: string,
  name: string,
): Promise<FileRead> {
  if (files === undefined) throw new Error("This window can't read the files a run saved.");
  const saved = (await source.log(runId)).findLast(
    (event) => event.type === "artifact.created" && event.name === name,
  );
  if (saved?.type !== "artifact.created") return { state: "not-in-run" };
  const bytes = await files.read(saved.hash);
  if (bytes === null) return { state: "gone" };
  return { state: "read", text: escapeHidden(new TextDecoder().decode(bytes)) };
}
