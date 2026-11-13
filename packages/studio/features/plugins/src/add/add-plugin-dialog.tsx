import { Button, Callout, Dialog, Field, Input, RadioGroup } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import { messageOf } from "../message-of.ts";
import type { PluginLoadProblem } from "../page/plugin-pages.ts";
import {
  ADD_PLUGIN,
  ADDRESS_FIELD,
  brokenLine,
  CHOOSE_FOLDER,
  ENTER_SOURCE,
  FOLDER_FIELD,
  FOLDER_OPTION,
  failedLine,
  GIT_OPTION,
  gettingLine,
  NO_MANIFEST,
  NOTE_LINE,
  offlineLine,
  openLine,
  REF_FIELD,
  REF_HINT,
  SOURCE_LABEL,
  sourceName,
  TRY_AGAIN,
  takenLine,
} from "./add-plugin-text.ts";
import type { PluginAddOutcome, PluginAddSource, PluginInstaller } from "./plugin-installer.ts";
import { ProblemList } from "./problem-list.tsx";

type SourceKind = "folder" | "git";

/** The props of `AddPluginDialog`. */
export interface AddPluginDialogProps {
  readonly installer: PluginInstaller;
  /** After it's added: the window closes this dialog and opens the plugin's trust check. */
  readonly onAdded: (plugin: string) => void;
  /** **Open Weather**, beside "already installed": the window opens that plugin's page. */
  readonly onOpen: (plugin: string) => void;
  readonly onCancel: () => void;
}

/** What went wrong, as the dialog shows it. */
type Failure =
  | { readonly kind: "line"; readonly text: string }
  | {
      readonly kind: "broken";
      readonly text: string;
      readonly problems: readonly PluginLoadProblem[];
    }
  | { readonly kind: "taken"; readonly text: string; readonly plugin: string };

/**
 * "Add plugin" (design section 4, checklist 3): where it comes from, a folder or a git
 * repository, each with its own field. **Add** stays pressable while the field is empty and says
 * what to enter. While it copies, the button is busy ("Getting halonic-weather…") and the fields
 * are unavailable. When it can't be added, a `danger` Callout says why and that nothing was
 * installed, and the button becomes **Try again**. When it's valid, `onAdded` runs, so the
 * trust check can open.
 *
 * @example
 * <AddPluginDialog installer={host.installer} onAdded={reviewPlugin} onOpen={openPage}
 *   onCancel={close} />
 */
export function AddPluginDialog({ installer, onAdded, onOpen, onCancel }: AddPluginDialogProps) {
  const [kind, setKind] = useState<SourceKind>("folder");
  const [folder, setFolder] = useState("");
  const [address, setAddress] = useState("");
  const [ref, setRef] = useState("");
  const [busyName, setBusyName] = useState<string | undefined>(undefined);
  const [fieldError, setFieldError] = useState<string | undefined>(undefined);
  const [failure, setFailure] = useState<Failure | undefined>(undefined);
  const sourceField = useRef<HTMLInputElement>(null);
  const aborter = useRef<AbortController | undefined>(undefined);
  const busy = busyName !== undefined;

  // Closing the dialog while it copies stops the copy.
  useEffect(() => () => aborter.current?.abort(), []);

  async function add() {
    const text = (kind === "folder" ? folder : address).trim();
    if (text === "") {
      setFieldError(ENTER_SOURCE);
      sourceField.current?.focus();
      return;
    }
    const name = sourceName({ kind, text });
    const controller = new AbortController();
    aborter.current = controller;
    setFieldError(undefined);
    setFailure(undefined);
    setBusyName(name);
    try {
      const outcome = await installer.add(sourceOf(kind, text, ref), controller.signal);
      if (controller.signal.aborted) return;
      if (outcome.kind === "added") {
        onAdded(outcome.plugin);
        return;
      }
      setFailure(failureOf(outcome, name));
    } catch (error) {
      if (controller.signal.aborted) return;
      setFailure({ kind: "line", text: failedLine(name, messageOf(error)) });
    }
    setBusyName(undefined);
  }

  async function choose() {
    if (busy) return;
    const path = await installer.chooseFolder?.();
    if (path === undefined) return;
    setFolder(path);
    setFieldError(undefined);
  }

  const typed = (set: (value: string) => void) => (event: { target: { value: string } }) => {
    setFieldError(undefined);
    set(event.target.value);
  };
  const folderField = (
    <Field label={FOLDER_FIELD} error={kind === "folder" ? (fieldError ?? null) : null}>
      <div className="flex items-center gap-2">
        <Input ref={sourceField} disabled={busy} value={folder} onChange={typed(setFolder)} />
        {installer.chooseFolder === undefined ? null : (
          <Button variant="secondary" busy={busy} onClick={() => void choose()}>
            {CHOOSE_FOLDER}
          </Button>
        )}
      </div>
    </Field>
  );
  const gitFields = (
    <>
      <Field label={ADDRESS_FIELD} error={kind === "git" ? (fieldError ?? null) : null}>
        <Input ref={sourceField} disabled={busy} value={address} onChange={typed(setAddress)} />
      </Field>
      <Field label={REF_FIELD} hint={REF_HINT}>
        <Input disabled={busy} value={ref} onChange={(event) => setRef(event.target.value)} />
      </Field>
    </>
  );

  return (
    <Dialog
      title={ADD_PLUGIN}
      size="md"
      form
      confirm={{
        label: failure === undefined ? ADD_PLUGIN : TRY_AGAIN,
        busyLabel: gettingLine(busyName ?? ""),
      }}
      busy={busy}
      {...(failure?.kind === "line" ? { error: failure.text } : {})}
      onConfirm={() => void add()}
      onCancel={onCancel}
    >
      <div className="flex flex-col gap-3">
        <Field label={SOURCE_LABEL}>
          <RadioGroup
            value={kind}
            onChange={(next) => {
              setKind(next);
              setFieldError(undefined);
              setFailure(undefined);
            }}
            options={[
              { value: "folder", label: FOLDER_OPTION, field: folderField },
              { value: "git", label: GIT_OPTION, field: gitFields },
            ]}
          />
        </Field>
        <p className="text-small text-fg-muted">{NOTE_LINE}</p>
        {failure === undefined || failure.kind === "line" ? null : (
          <FailureCallout failure={failure} onOpen={onOpen} />
        )}
      </div>
    </Dialog>
  );
}

function FailureCallout({
  failure,
  onOpen,
}: {
  readonly failure: Exclude<Failure, { kind: "line" }>;
  readonly onOpen: (plugin: string) => void;
}) {
  if (failure.kind === "taken") {
    return (
      <Callout
        tone="danger"
        action={{
          label: openLine(failure.plugin),
          onClick: () => {
            onOpen(failure.plugin);
          },
        }}
      >
        {failure.text}
      </Callout>
    );
  }
  return (
    <Callout tone="danger">
      {failure.text}
      <ProblemList problems={failure.problems} />
    </Callout>
  );
}

function failureOf(outcome: Exclude<PluginAddOutcome, { kind: "added" }>, name: string): Failure {
  switch (outcome.kind) {
    case "broken":
      return {
        kind: "broken",
        text: brokenLine(outcome.name ?? name, outcome.problems.length),
        problems: outcome.problems,
      };
    case "taken":
      return { kind: "taken", text: takenLine(outcome.plugin), plugin: outcome.plugin };
    case "offline":
      return { kind: "line", text: offlineLine(outcome.host) };
    case "no-manifest":
      return { kind: "line", text: NO_MANIFEST };
  }
}

/** What the person typed, as the installer takes it: the version only when there is one. */
function sourceOf(kind: SourceKind, text: string, ref: string): PluginAddSource {
  if (kind === "folder") return { kind, path: text };
  const version = ref.trim();
  return { kind, address: text, ...(version === "" ? {} : { ref: version }) };
}
