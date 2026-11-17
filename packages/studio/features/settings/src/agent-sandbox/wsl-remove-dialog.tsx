import { Dialog, RadioGroup } from "@halonicjs/studio-kit";
import { useId, useRef, useState } from "react";
import type { AgentSandboxHost, WslRemoveRequest, WslRemoveResult } from "../api.ts";
import * as text from "./sandbox-text.ts";

type ChoiceValue = "backup" | "no-backup";

/** Where the dialog is: the three steps, then how the removal ended. */
type Stage =
  | { readonly at: "explain" }
  | { readonly at: "choose" }
  | { readonly at: "working"; readonly file: string | null }
  | { readonly at: "done"; readonly file: string | null }
  | {
      readonly at: "problem";
      readonly title: string;
      readonly body: string;
      readonly details: string | null;
      /** The backup file the request named, or null when none was chosen. */
      readonly file: string | null;
      /** What a retry sends: the original request, or `remove-only` once the backup is saved. */
      readonly retry: WslRemoveRequest;
      readonly kind: "backup" | "remove" | "refused" | "unknown";
      /** Why the host refused, for `kind: "refused"`. */
      readonly refusal?: Extract<WslRemoveResult, { outcome: "refused" }>["reason"];
    };

/** The props of {@link WslRemoveDialog}. */
export interface WslRemoveDialogProps {
  readonly host: AgentSandboxHost;
  /** Closes the dialog. `removed` is true when the sandbox is gone, so the section checks again. */
  readonly onClose: (removed: boolean) => void;
  /** Says a line to screen readers, the shell's announcer. Used once, when the sandbox is gone. */
  readonly announce?: (line: string) => void;
  /** Today's date as `YYYY-MM-DD`, for the suggested backup name. */
  readonly today?: string;
}

/** What every step needs: the host, the way out and what the steps share. */
interface StepProps {
  readonly host: AgentSandboxHost;
  readonly onClose: (removed: boolean) => void;
  readonly go: (stage: Stage) => void;
  readonly run: (request: WslRemoveRequest) => Promise<void>;
  readonly pick: () => Promise<string | null>;
}

/**
 * Settings › Agent sandbox › **Remove sandbox setup** (`settings.wsl-remove-dialog`, HAL-10974):
 * what will happen, then the choice about the files (none picked at first), then progress and the
 * result. Nothing is removed before the confirming button of step 2; once removal starts there is
 * no way out until the host answers.
 */
export function WslRemoveDialog({ host, onClose, announce, today }: WslRemoveDialogProps) {
  const [stage, setStage] = useState<Stage>({ at: "explain" });
  const [file, setFile] = useState<string | null>(null);
  const running = useRef(false);

  const pick = async () => {
    const date = today ?? new Date().toISOString().slice(0, 10);
    const chosen = await host.chooseBackupFile?.(text.wslBackupName(date));
    if (chosen) setFile(chosen);
    return chosen ?? null;
  };

  const run = async (request: WslRemoveRequest) => {
    if (running.current || host.removeWslSetup === undefined) return;
    running.current = true;
    const backup = request.choice === "export-then-remove" ? request.file : null;
    setStage({ at: "working", file: backup });
    let next: Stage;
    try {
      next = stageFor(await host.removeWslSetup(request), request);
    } catch (error) {
      // The host never answered (busy, connection dropped): nothing says the backup was made.
      next = unknownProblem(request, errorText(error));
    } finally {
      running.current = false;
    }
    if (next.at === "done") announce?.(text.WSL_DONE_TITLE);
    setStage(next);
  };

  const step = { host, onClose, go: setStage, run, pick };
  switch (stage.at) {
    case "explain":
      return <ExplainStep {...step} />;
    case "choose":
      return <ChooseStep {...step} file={file} />;
    case "working":
      return <WorkingStep file={stage.file} />;
    case "done":
      return <DoneStep {...step} file={stage.file} />;
    case "problem":
      return <ProblemStep {...step} problem={stage} />;
  }
}

function ExplainStep({ onClose, go }: StepProps) {
  return (
    <Dialog
      title={text.WSL_REMOVE_TITLE}
      confirm={{ label: text.WSL_CONTINUE, busyLabel: text.WSL_BUSY_CONTINUE }}
      cancelLabel={text.REMOVE_CANCEL}
      onConfirm={() => go({ at: "choose" })}
      onCancel={() => onClose(false)}
    >
      <div className="flex flex-col gap-2">
        <p>{text.WSL_REMOVE_EXPLAIN}</p>
        <p>{text.WSL_REMOVE_EXPLAIN_AGENTS}</p>
      </div>
    </Dialog>
  );
}

const confirmLabels = {
  none: text.WSL_CONFIRM_NONE,
  backup: text.WSL_CONFIRM_BACKUP,
  "no-backup": text.WSL_CONFIRM_NO_BACKUP,
} as const;

function ChooseStep({ host, onClose, go, run, pick, file }: StepProps & { file: string | null }) {
  const [choice, setChoice] = useState<ChoiceValue | null>(null);
  const whyId = useId();
  const confirmChoice = () => {
    if (choice === "no-backup") void run({ choice: "remove-only" });
    else if (choice === "backup" && file) void run({ choice: "export-then-remove", file });
    else if (choice === "backup") void pick();
  };
  const backup = {
    value: "backup",
    label: text.WSL_CHOICE_BACKUP,
    note: text.WSL_CHOICE_BACKUP_HELP,
  } as const;
  return (
    <Dialog
      title={text.WSL_CHOICE_TITLE}
      confirm={{
        label: confirmLabels[choice ?? "none"],
        variant: choice === "no-backup" ? "danger" : "primary",
        busyLabel: text.WSL_BUSY_REMOVE,
        // Nothing is picked at first: the button says why it can't be used yet.
        ...(choice === null ? { unavailable: { reason: whyId } } : {}),
      }}
      alternative={{ label: text.WSL_BACK, onClick: () => go({ at: "explain" }) }}
      cancelLabel={text.REMOVE_CANCEL}
      onConfirm={confirmChoice}
      onCancel={() => onClose(false)}
    >
      <RadioGroup<ChoiceValue>
        label={text.WSL_CHOICE_TITLE}
        value={choice}
        onChange={setChoice}
        options={[
          host.chooseBackupFile
            ? { ...backup, field: <BackupFile file={file} onChoose={pick} /> }
            : { ...backup, unavailable: true },
          {
            value: "no-backup",
            label: text.WSL_CHOICE_NO_BACKUP,
            note: text.WSL_CHOICE_NO_BACKUP_HELP,
          },
        ]}
      />
      {choice === null ? (
        <p id={whyId} className="mt-3 text-small text-fg-muted">
          {text.WSL_CONFIRM_NONE_WHY}
        </p>
      ) : null}
    </Dialog>
  );
}

/** No way out while the host works: Escape and the ✕ do nothing. */
function WorkingStep({ file }: { readonly file: string | null }) {
  return (
    <Dialog title={text.WSL_REMOVE_TITLE} onCancel={() => {}}>
      <div className="flex flex-col gap-1" aria-live="polite">
        <p>{file ? text.WSL_BUSY_BACKUP : text.WSL_BUSY_REMOVE}</p>
        <p className="text-small text-fg-muted">
          {file ? text.WSL_BUSY_BACKUP_NOTE : text.WSL_STARTED}
        </p>
      </div>
    </Dialog>
  );
}

function DoneStep({ host, onClose, file }: StepProps & { file: string | null }) {
  const show = file !== null ? host.showInFolder : undefined;
  return (
    <Dialog
      title={text.WSL_DONE_TITLE}
      confirm={{
        label: show ? text.WSL_SHOW_IN_FOLDER : text.WSL_DONE,
        busyLabel: text.WSL_BUSY_CLOSE,
      }}
      cancelLabel={show ? text.WSL_DONE : text.WSL_CLOSE}
      onConfirm={() => {
        if (show && file) void show.call(host, file);
        onClose(true);
      }}
      onCancel={() => onClose(true)}
    >
      <p>{file !== null ? text.wslDoneBackup(file) : text.WSL_DONE_NO_BACKUP}</p>
    </Dialog>
  );
}

type Problem = Extract<Stage, { at: "problem" }>;

function ProblemStep({ host, onClose, go, run, pick, problem }: StepProps & { problem: Problem }) {
  let alternative: { readonly label: string; readonly onClick: () => void } | undefined;
  if (problem.kind === "backup") {
    alternative = {
      label: text.WSL_CHOOSE_ANOTHER,
      onClick: () => {
        void pick().then((chosen) => {
          if (chosen) void run({ choice: "export-then-remove", file: chosen });
        });
      },
    };
  } else if (problem.kind === "remove" && problem.file !== null && host.showInFolder) {
    const saved = problem.file;
    alternative = { label: text.WSL_SHOW_BACKUP, onClick: () => void host.showInFolder?.(saved) };
  }
  const retry = () => run(problem.retry);
  const refused = problem.kind === "refused";
  // Only a refused backup file can be fixed by the person; the other refusals end here, with no
  // footer: the ✕ closes.
  const badFile = problem.refusal === "bad-export-file";
  const closeOnly = refused && !badFile;
  const confirm = closeOnly
    ? undefined
    : {
        label: refused ? text.WSL_CHOOSE_ANOTHER : text.WSL_TRY_AGAIN,
        busyLabel: text.WSL_BUSY_REMOVE,
      };
  return (
    <Dialog
      title={problem.title}
      {...(confirm ? { confirm } : {})}
      {...(alternative ? { alternative } : {})}
      cancelLabel={problem.kind === "remove" ? text.WSL_CLOSE : text.REMOVE_CANCEL}
      onConfirm={refused ? () => go({ at: "choose" }) : () => void retry()}
      onCancel={() => onClose(problem.refusal === "distro-missing")}
    >
      <div className="flex flex-col gap-2">
        <p>{problem.body}</p>
        {problem.details ? (
          <p className="select-text break-all text-small text-fg-muted">
            {text.WSL_DETAILS}: {problem.details}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** The file row under the backup choice: `Save to: path` and **Choose location…**. */
function BackupFile({
  file,
  onChoose,
}: {
  readonly file: string | null;
  readonly onChoose: () => Promise<string | null>;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      {file ? <p className="select-text break-all text-small">{text.wslSaveTo(file)}</p> : null}
      <button
        type="button"
        className="text-small text-primary underline"
        onClick={() => void onChoose()}
      >
        {text.WSL_CHOOSE_LOCATION}
      </button>
    </div>
  );
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "";
}

/** What the dialog shows for the host's answer. */
function stageFor(result: WslRemoveResult, request: WslRemoveRequest): Stage {
  const backup = request.choice === "export-then-remove" ? request.file : null;
  switch (result.outcome) {
    case "removed":
      return { at: "done", file: result.exportedTo ?? backup };
    case "kept":
      return { at: "choose" };
    case "refused":
      return {
        at: "problem",
        kind: "refused",
        title: text.WSL_REFUSED_TITLE,
        body: {
          "distro-not-ours": text.WSL_REFUSED_NOT_OURS,
          "distro-missing": text.WSL_REFUSED_MISSING,
          "bad-export-file": text.WSL_REFUSED_FILE,
        }[result.reason],
        details: null,
        file: null,
        retry: request,
        refusal: result.reason,
      };
    case "failed": {
      const reason = text.WSL_REASON_FALLBACK;
      const details = result.detail.trim() === "" ? null : result.detail;
      if (result.reason === "export-failed") {
        return {
          at: "problem",
          kind: "backup",
          title: text.WSL_BACKUP_FAILED_TITLE,
          body: text.wslBackupFailed(backup ?? "", reason),
          details,
          file: backup,
          retry: request,
        };
      }
      return {
        at: "problem",
        kind: "remove",
        title: text.WSL_REMOVE_FAILED_TITLE,
        body: backup ? text.wslRemoveFailedBackup(backup, reason) : text.wslRemoveFailed(reason),
        details,
        file: backup,
        // The backup is already saved: a retry only removes.
        retry: { choice: "remove-only" },
      };
    }
  }
}

/** A thrown error: the host didn't answer, so no claim about the backup, and a retry is unchanged. */
function unknownProblem(request: WslRemoveRequest, detail: string): Stage {
  return {
    at: "problem",
    kind: "unknown",
    title: text.WSL_REMOVE_FAILED_TITLE,
    body: text.wslRemoveFailed(text.WSL_REASON_FALLBACK),
    details: detail.trim() === "" ? null : detail,
    file: null,
    retry: request,
  };
}
