import { Button, Callout, SkeletonBar } from "@halonicjs/studio-kit";
import type { WorkspaceContext } from "@halonicjs/studio-shell";
import { useEffect, useState } from "react";
import { type CompareChoice, type FileCompare, FilesHostService } from "../files-host.ts";
import { filesWords } from "../files-words.ts";

type Loaded =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly compare: FileCompare }
  | { readonly kind: "error"; readonly reason: string };

/**
 * Yours and the file in the folder side by side, with Keep mine, Use the other one and, when the
 * two don't change the same lines, Combine both. A choice is saved at once and is one undo step
 * (requirement `files.ui.compare`).
 */
export function CompareView({
  path,
  context,
  onDone,
  onCancel,
  initialFailure,
}: {
  readonly path: string;
  readonly context: WorkspaceContext;
  readonly onDone: () => void;
  readonly onCancel: () => void;
  /** Why a choice made in the strip failed, shown until the next choice. */
  readonly initialFailure?: string | undefined;
}) {
  const host = context.services.get(FilesHostService);
  const [loaded, setLoaded] = useState<Loaded>({ kind: "loading" });
  const [failure, setFailure] = useState<string | undefined>(initialFailure);
  const [settling, setSettling] = useState(false);

  useEffect(() => {
    let stopped = false;
    host.compare(path).then(
      (compare) => {
        if (!stopped) setLoaded({ kind: "ready", compare });
      },
      (error: unknown) => {
        if (!stopped) setLoaded({ kind: "error", reason: reasonOf(error) });
      },
    );
    return () => {
      stopped = true;
    };
  }, [host, path]);

  async function choose(choice: CompareChoice): Promise<void> {
    setFailure(undefined);
    setSettling(true);
    try {
      await host.settle(path, choice);
      onDone();
    } catch (error) {
      setFailure(reasonOf(error));
      setSettling(false);
    }
  }

  if (loaded.kind === "loading") {
    return (
      <div role="status" aria-label={filesWords.compareLoading} className="grid gap-3 p-4">
        <SkeletonBar kind="title" width="2/3" />
        <SkeletonBar kind="title" width="1/2" />
      </div>
    );
  }
  if (loaded.kind === "error") {
    return (
      <div className="grid gap-3 p-4">
        <Callout tone="danger">{filesWords.compareFailed(loaded.reason)}</Callout>
        <div>
          <Button variant="secondary" onClick={onCancel}>
            {filesWords.cancel}
          </Button>
        </div>
      </div>
    );
  }
  const { compare } = loaded;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
      {failure !== undefined && (
        <Callout tone="danger">{filesWords.compareFailed(failure)}</Callout>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-3">
        <Side heading={filesWords.compareMine} text={compare.mine} />
        <Side heading={filesWords.compareTheirs} text={compare.theirs} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" busy={settling} onClick={() => choose("keep-mine")}>
          {filesWords.keepMine}
        </Button>
        <Button variant="secondary" busy={settling} onClick={() => choose("use-other")}>
          {filesWords.useOther}
        </Button>
        {compare.combined !== null && (
          <Button variant="secondary" busy={settling} onClick={() => choose("combine-both")}>
            {filesWords.combineBoth}
          </Button>
        )}
        <Button variant="ghost" onClick={onCancel}>
          {filesWords.cancel}
        </Button>
      </div>
    </div>
  );
}

function Side({ heading, text }: { readonly heading: string; readonly text: string | null }) {
  return (
    <section aria-label={heading} className="flex min-h-0 min-w-0 flex-col">
      <h2 className="text-body-strong">{heading}</h2>
      <pre className="min-h-0 flex-1 overflow-auto rounded-sm border border-border p-2 font-mono text-small">
        {text ?? filesWords.compareNone}
      </pre>
    </section>
  );
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
