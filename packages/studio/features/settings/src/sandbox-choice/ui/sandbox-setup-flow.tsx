import { Button, CopyButton, Spinner } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import * as text from "../sandbox-choice-text.ts";
import { SandboxModal } from "./sandbox-modal.tsx";

/** How far one setup step or test check has got. */
export type SandboxStepStatus = "done" | "working" | "stopped" | "waiting";

/** The result of one quick-test check: `pending` until it has run. */
export type SandboxCheckResult = "pending" | "passed" | "failed";

/** Why a setup can't go on, as the plan's S3c words it. */
export type SandboxCantSetUpReason = keyof typeof text.CANT_REASONS;

/** What the setup screens show. Each state is one screen of the plan (S3 to S5). */
export type SandboxSetupState =
  /** S3. `path` picks the step list; `permissionNext` shows the line before the permission prompt. */
  | {
      readonly kind: "setting-up";
      readonly path: "wsl" | "native";
      /** How many steps are done; the next one is working. */
      readonly stepsDone: number;
      readonly permissionNext?: "windows" | "password";
      /** The download failed: shows the offline line with Try again and Other options. */
      readonly offline?: boolean;
    }
  /** S3b. */
  | { readonly kind: "restart-needed" }
  /** S3c. */
  | { readonly kind: "cant-set-up"; readonly reason: SandboxCantSetUpReason }
  /** S3d: macOS and Linux, a tool is missing. `tools` lists every check the engine ran. */
  | {
      readonly kind: "tool-missing";
      readonly tools: readonly { readonly name: string; readonly ready: boolean }[];
      readonly command: string;
      readonly ubuntu2404?: boolean;
    }
  /** S4: `checks` are the probes the real check runs, in its order, with the result so far. */
  | {
      readonly kind: "testing";
      readonly checks: readonly {
        /** Stable key of the check, such as the engine's probe id. */
        readonly id: string;
        readonly label: string;
        readonly result: SandboxCheckResult;
      }[];
    }
  /** S4b: `failedCheck` is the failed check in plain words, such as "Agents could still read files outside your project". */
  | { readonly kind: "test-failed"; readonly failedCheck: string }
  /** S5. `caveat` is the one that matters for this backend, or absent. */
  | { readonly kind: "done"; readonly name: string; readonly caveat?: string }
  /** S5': no sandbox. `promise` shows the asking sentence only once the harness really asks (O4). */
  | { readonly kind: "done-none"; readonly promise: boolean };

/** Props for {@link SandboxSetupFlow}. */
export interface SandboxSetupFlowProps {
  readonly state: SandboxSetupState;
  /** The small text above the title; left out when the card is opened from Settings. */
  readonly step?: string;
  readonly onCancel: () => void;
  readonly onTryAgain: () => void;
  readonly onChooseAnother: () => void;
  readonly onContinueWithout: () => void;
  readonly onRestartNow: () => void;
  readonly onRestartLater: () => void;
  readonly onCheckAgain: () => void;
  readonly onOpenHalonic: () => void;
}

/**
 * S3 Setting up (with Restart needed, Can't set up and the missing-tool step), S4 Quick test
 * (and when it didn't pass) and S5 Done, in the same modal as the choice. It shows the state it is
 * given and reports what the person pressed; the engine decides which screen comes next
 * (`settings.sandbox-setup-flow`).
 */
export function SandboxSetupFlow(props: SandboxSetupFlowProps) {
  const { state } = props;
  // A key per screen: two screens can render the same component, and focus only moves to the
  // new title when the modal mounts again.
  const key = state.kind === "setting-up" && state.offline === true ? "offline" : state.kind;
  return <SetupScreen key={key} {...props} />;
}

function SetupScreen(props: SandboxSetupFlowProps) {
  const { state, step } = props;
  switch (state.kind) {
    case "setting-up":
      return <SettingUp {...props} state={state} />;
    case "restart-needed":
      return (
        <SandboxModal
          {...stepOf(step)}
          title={text.RESTART_TITLE}
          focusTitle
          footer={
            <div className="flex items-center justify-end gap-2">
              <Button variant="secondary" onClick={props.onRestartLater}>
                {text.RESTART_LATER}
              </Button>
              <Button variant="primary" onClick={props.onRestartNow}>
                {text.RESTART_NOW}
              </Button>
            </div>
          }
        >
          <p>{text.RESTART_BODY}</p>
        </SandboxModal>
      );
    case "cant-set-up":
      return (
        <SandboxModal
          {...stepOf(step)}
          title={text.CANT_TITLE}
          focusTitle
          footer={
            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={props.onContinueWithout}>
                {text.CONTINUE_WITHOUT}
              </Button>
              <Button variant="primary" onClick={props.onChooseAnother}>
                {text.CHOOSE_ANOTHER}
              </Button>
            </div>
          }
        >
          <p role="alert">{text.CANT_REASONS[state.reason]}</p>
          <p className="text-small text-fg-muted">{text.CANT_HINTS[state.reason]}</p>
        </SandboxModal>
      );
    case "tool-missing":
      return <ToolMissing {...props} state={state} />;
    case "testing":
      return (
        <SandboxModal {...stepOf(step)} title={text.TEST_TITLE} focusTitle>
          <p>{text.TEST_INTRO}</p>
          <ul className="flex flex-col gap-2" aria-live="polite">
            {state.checks.map((check) => (
              <li key={check.id} className="flex items-center gap-2">
                <ResultMark result={check.result} />
                <span>{check.label}</span>
              </li>
            ))}
          </ul>
        </SandboxModal>
      );
    case "test-failed":
      return (
        <SandboxModal
          {...stepOf(step)}
          title={text.TEST_FAILED_TITLE}
          focusTitle
          footer={
            <div className="flex items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={props.onChooseAnother}>
                  {text.CHOOSE_ANOTHER}
                </Button>
                <Button variant="ghost" size="sm" onClick={props.onContinueWithout}>
                  {text.CONTINUE_WITHOUT}
                </Button>
              </div>
              <Button variant="primary" onClick={props.onTryAgain}>
                {text.TRY_AGAIN}
              </Button>
            </div>
          }
        >
          <p role="alert">{text.testFailedBody(state.failedCheck)}</p>
        </SandboxModal>
      );
    case "done":
      return (
        <Done
          title={text.DONE_TITLE}
          footer={text.DONE_FOOTER}
          onOpen={props.onOpenHalonic}
          {...stepOf(step)}
        >
          <p>{text.doneBody(state.name)}</p>
          {state.caveat === undefined ? null : (
            <p className="text-small">{text.doneCaveat(state.caveat)}</p>
          )}
        </Done>
      );
    case "done-none":
      return (
        <Done
          title={text.NONE_TITLE}
          footer={text.NONE_FOOTER}
          onOpen={props.onOpenHalonic}
          {...stepOf(step)}
        >
          {state.promise ? <p>{text.NONE_BODY}</p> : null}
        </Done>
      );
  }
}

/** The modal's `step` prop only when there is one (the props forbid an explicit `undefined`). */
const stepOf = (step: string | undefined) => (step === undefined ? {} : { step });

function SettingUp({
  state,
  step,
  onCancel,
  onTryAgain,
  onChooseAnother,
}: SandboxSetupFlowProps & { readonly state: Extract<SandboxSetupState, { kind: "setting-up" }> }) {
  const steps = state.path === "wsl" ? text.STEPS_WSL : text.STEPS_NATIVE;
  return (
    <SandboxModal
      {...stepOf(step)}
      title={text.SETUP_TITLE}
      focusTitle
      footer={
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            {text.CANCEL}
          </Button>
        </div>
      }
    >
      <ol className="flex flex-col gap-2">
        {steps.map((label, index) => {
          const status = statusOf(index, state.stepsDone, state.offline === true);
          return (
            <li key={label} className="flex items-center gap-2">
              <StatusMark status={status} />
              <span>{label}</span>
              <span className="ml-auto text-small text-fg-muted">{statusWord(status)}</span>
            </li>
          );
        })}
      </ol>
      {state.permissionNext === undefined ? null : (
        <p className="text-small" role="note">
          {state.permissionNext === "windows"
            ? text.PERMISSION_NEXT_WINDOWS
            : text.PERMISSION_NEXT_PASSWORD}
        </p>
      )}
      {state.offline === true ? (
        <div role="alert" className="flex flex-col gap-2">
          <p>{text.OFFLINE}</p>
          <div className="flex gap-2">
            <Button variant="primary" onClick={onTryAgain}>
              {text.TRY_AGAIN}
            </Button>
            <Button variant="secondary" onClick={onChooseAnother}>
              {text.OTHER_OPTIONS}
            </Button>
          </div>
        </div>
      ) : null}
    </SandboxModal>
  );
}

function statusOf(index: number, done: number, offline: boolean): SandboxStepStatus {
  if (index < done) return "done";
  if (index === done) return offline ? "stopped" : "working";
  return "waiting";
}

function statusWord(status: SandboxStepStatus): string {
  if (status === "done") return text.STEP_DONE;
  if (status === "working") return text.STEP_WORKING;
  return status === "stopped" ? text.STEP_STOPPED : text.STEP_WAITING;
}

function StatusMark({ status }: { readonly status: SandboxStepStatus }) {
  if (status === "working") {
    return (
      <span aria-hidden="true" className="size-4 shrink-0">
        <Spinner />
      </span>
    );
  }
  return (
    <span aria-hidden="true" className="w-4 text-center text-fg-muted">
      {status === "done" ? "✓" : "○"}
    </span>
  );
}

const resultMarks: Record<SandboxCheckResult, { mark: string; word: string }> = {
  passed: { mark: "✓", word: text.CHECK_PASSED },
  failed: { mark: "✕", word: text.CHECK_DIDNT_PASS },
  pending: { mark: "○", word: text.CHECK_PENDING },
};

function ResultMark({ result }: { readonly result: SandboxCheckResult }) {
  const { mark, word } = resultMarks[result];
  return (
    <>
      <span aria-hidden="true" className="w-4 text-center">
        {mark}
      </span>
      <span className="sr-only">{word}: </span>
    </>
  );
}

function ToolMissing({
  state,
  step,
  onCheckAgain,
  onChooseAnother,
}: SandboxSetupFlowProps & {
  readonly state: Extract<SandboxSetupState, { kind: "tool-missing" }>;
}) {
  const missing = state.tools.filter((tool) => !tool.ready).map((tool) => tool.name);
  return (
    <SandboxModal
      {...stepOf(step)}
      title={text.CHECK_TITLE}
      focusTitle
      footer={
        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={onChooseAnother}>
            {text.CHOOSE_ANOTHER}
          </Button>
          <Button variant="primary" onClick={onCheckAgain}>
            {text.CHECK_AGAIN}
          </Button>
        </div>
      }
    >
      <p>{text.checkBody(missing)}</p>
      {state.ubuntu2404 === true ? <p className="text-small">{text.UBUNTU_2404}</p> : null}
      <div className="flex items-center gap-2 rounded-md border border-border bg-surface-subtle p-2">
        <code className="min-w-0 flex-1 break-all font-mono text-small">{state.command}</code>
        <CopyButton text={state.command} label={text.COPY_COMMAND} />
      </div>
      <ul className="flex flex-col gap-1 text-small">
        {state.tools.map((tool) => (
          <li key={tool.name}>
            {tool.ready ? text.toolReady(tool.name) : text.toolMissing(tool.name)}
          </li>
        ))}
      </ul>
    </SandboxModal>
  );
}

function Done({
  title,
  footer,
  step,
  onOpen,
  children,
}: {
  readonly title: string;
  readonly footer: string;
  readonly step?: string;
  readonly onOpen: () => void;
  readonly children: ReactNode;
}) {
  return (
    <SandboxModal
      {...stepOf(step)}
      title={title}
      focusTitle
      footer={
        <>
          <p className="text-small text-fg-muted">{footer}</p>
          <div className="flex justify-end">
            <Button variant="primary" onClick={onOpen}>
              {text.OPEN_HALONIC}
            </Button>
          </div>
        </>
      }
    >
      {children}
    </SandboxModal>
  );
}
