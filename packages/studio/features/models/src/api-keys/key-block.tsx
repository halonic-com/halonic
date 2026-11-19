import { Button, Dialog, Field, Input, SecretText } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { type RefObject, useEffect, useEffectEvent, useRef, useState } from "react";
import type { KeyEntry, ModelKeys } from "../api.ts";
import {
  CHANGE_KEY,
  changeQuestion,
  hostCommand,
  KEY_CHECK_FAILED,
  KEY_CHECKING,
  KEY_HEADING,
  KEY_REMOVED_LINE,
  KEY_SET,
  keptLine,
  NEEDS_SECRET_NAME,
  NO_KEY,
  OFF_HOST_HTTPS_LEAD,
  PASTE_FIRST,
  REMOVE_KEY,
  REPLACE_PLACEHOLDER,
  removeFailedLine,
  removeQuestion,
  SAVE_KEY,
  savedLine,
  saveFailedLine,
  saveUnknownQuestion,
  TRY_AGAIN,
  unavailableLine,
} from "./key-text.ts";

/** The props of {@link KeyBlock}. */
export interface KeyBlockProps {
  readonly keys: ModelKeys;
  /** The provider's `secret:` name; `undefined` when it has none. */
  readonly secretName: string | undefined;
  /** The provider's name, for "Saved key for …". */
  readonly providerName: string;
  /** Called after a key is saved where none was stored (trigger (b) of the Prices and budget step). */
  readonly onFirstKey?: () => void;
  /**
   * Set when the page was asked to open at the key, as the run page's **Add key** asks
   * (`models.api-keys.open-at-key`), and changed each time it is asked again. The field then
   * takes the focus, or the heading when there is no field.
   */
  readonly focusRequest?: string | undefined;
}

/** What the block knows about the stored key; `unknown` after a failed check. */
type Stored = "checking" | "set" | "none" | "unknown";

/** Whether a key is stored under the secret name, read when the provider changes. */
function useStoredKey(
  keys: ModelKeys,
  secretName: string | undefined,
): [Stored, (stored: Stored) => void, () => void] {
  const [stored, setStored] = useState<Stored>("checking");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (secretName === undefined) return;
    let current = true;
    setStored("checking");
    keys.stored(secretName).then(
      (found) => current && setStored(found ? "set" : "none"),
      () => current && setStored("unknown"),
    );
    return () => {
      current = false;
    };
  }, [keys, secretName, attempt]);
  return [stored, setStored, () => setAttempt((count) => count + 1)];
}

/** What is being asked in the open confirm. */
type Confirm = "change" | "save" | "remove";

/**
 * The key block of a provider's page (`models.api-keys.*`): whether a key is stored, a masked
 * field that never shows or returns the key, and **Save key** and **Remove key**, each asking
 * first when a key is already stored. The typed key lives in the input only; it becomes a
 * `SecretText` for the one request that stores it and the input is cleared when that succeeds.
 *
 * @example
 * <KeyBlock keys={keys} secretName={provider.secret} />
 */
export function KeyBlock({
  keys,
  secretName,
  providerName,
  onFirstKey,
  focusRequest,
}: KeyBlockProps) {
  const { entry } = keys;
  if (entry.kind === "unavailable") {
    return (
      <UnavailableKey reason={entry.reason} secretName={secretName} focusRequest={focusRequest} />
    );
  }
  return (
    <KeyField
      keys={keys}
      entry={entry}
      secretName={secretName}
      providerName={providerName}
      {...(onFirstKey === undefined ? {} : { onFirstKey })}
      focusRequest={focusRequest}
    />
  );
}

/**
 * Scrolls to the element and focuses it once for each new request. It waits for the shell to
 * focus the page's heading first, which it does as the tab is shown, so the focus stays here.
 */
function useFocusWhenAsked(
  request: string | undefined,
  target: RefObject<HTMLElement | null>,
): void {
  const reveal = useEffectEvent(() => {
    const element = target.current;
    element?.scrollIntoView?.({ block: "center" });
    element?.focus({ preventScroll: true });
  });
  useEffect(() => {
    if (request === undefined) return;
    const timer = window.setTimeout(reveal, 0);
    return () => window.clearTimeout(timer);
  }, [request]);
}

/** The block where this Studio can't take a key: the heading and how to set it on the host. */
function UnavailableKey({
  reason,
  secretName,
  focusRequest,
}: {
  readonly reason: Extract<KeyEntry, { kind: "unavailable" }>["reason"];
  readonly secretName: string | undefined;
  readonly focusRequest: string | undefined;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useFocusWhenAsked(focusRequest, heading);
  return (
    <section aria-labelledby="key-heading" className="flex flex-col gap-1">
      <h2 ref={heading} id="key-heading" tabIndex={-1} className="text-heading outline-none">
        {KEY_HEADING}
      </h2>
      <HostCommandLine {...unavailableLine(reason)} secretName={secretName ?? "<name>"} />
    </section>
  );
}

interface KeyFieldProps extends KeyBlockProps {
  readonly entry: Extract<KeyEntry, { kind: "field" }>;
}

/** The status, the field and the buttons, for a Studio where a key can be typed. */
function KeyField({
  keys,
  entry,
  secretName,
  providerName,
  onFirstKey,
  focusRequest,
}: KeyFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  // A provider with no secret name has no field; its heading's line says what is missing.
  useFocusWhenAsked(focusRequest, secretName === undefined ? heading : input);
  const [stored, setStored, check] = useStoredKey(keys, secretName);
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState("");

  async function run(
    action: () => Promise<void>,
    failure: (reason: string) => string,
    line: string,
    secret?: string,
  ) {
    setBusy(true);
    setProblem(undefined);
    setDone("");
    try {
      await action();
      setDone(line);
      return true;
    } catch (error) {
      // No reason is a known phrase ("Couldn't save the key. Try again."). The key is taken out of
      // the reason, in case the error repeats it.
      const reason = errorReasonFor(error, "");
      setProblem(failure(secret === undefined ? reason : reason.split(secret).join("")));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    const value = input.current?.value.trim() ?? "";
    if (secretName === undefined || value === "") return;
    const saved = await run(
      () => keys.save(secretName, new SecretText(value)),
      (reason) => saveFailedLine(reason, stored === "set"),
      savedLine(providerName),
      value,
    );
    if (!saved) return;
    if (input.current !== null) input.current.value = "";
    setHasText(false);
    const first = stored === "none";
    setStored("set");
    input.current?.focus();
    if (first) onFirstKey?.();
  }

  async function remove() {
    if (secretName === undefined) return;
    if (await run(() => keys.remove(secretName), removeFailedLine, KEY_REMOVED_LINE)) {
      setStored("none");
    }
  }

  function save() {
    if (busy) return;
    if (!hasText) {
      setDone("");
      setProblem(PASTE_FIRST);
      input.current?.focus();
      return;
    }
    if (stored === "unknown") setConfirm("save");
    else if (stored !== "none") setConfirm("change");
    else void send();
  }

  return (
    <section aria-labelledby="key-heading" className="flex flex-col gap-2">
      <h2 ref={heading} id="key-heading" tabIndex={-1} className="text-heading outline-none">
        {KEY_HEADING}
      </h2>
      {secretName === undefined ? (
        <p>{NEEDS_SECRET_NAME}</p>
      ) : (
        <>
          {entry.offHostHttps ? (
            <HostCommandLine lead={OFF_HOST_HTTPS_LEAD} command secretName={secretName} />
          ) : null}
          <KeyStatus stored={stored} onTryAgain={check} />
          <form
            className="flex flex-wrap items-start gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            <div className="min-w-0 flex-1">
              <Field label={KEY_HEADING} hideLabel hint={keptLine(entry)} error={problem ?? null}>
                <Input
                  ref={input}
                  type="password"
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-1p-ignore=""
                  data-lpignore="true"
                  placeholder={stored === "set" ? REPLACE_PLACEHOLDER : undefined}
                  onChange={(event) => {
                    const filled = event.target.value.trim() !== "";
                    setHasText(filled);
                    if (filled && problem === PASTE_FIRST) setProblem(undefined);
                  }}
                />
              </Field>
            </div>
            <Button type="submit" variant="primary" busy={busy} busyLabel="Saving…">
              {SAVE_KEY}
            </Button>
            {stored === "set" ? (
              <Button variant="ghost" onClick={() => (busy ? undefined : setConfirm("remove"))}>
                {REMOVE_KEY}
              </Button>
            ) : null}
          </form>
          <p role="status">{done}</p>
          {confirm === undefined ? null : (
            <KeyConfirm
              kind={confirm}
              secretName={secretName}
              returnFocus={() => input.current}
              onConfirm={() => {
                setConfirm(undefined);
                void (confirm === "remove" ? remove() : send());
              }}
              onCancel={() => setConfirm(undefined)}
            />
          )}
        </>
      )}
    </section>
  );
}

const STATUS_LINE = {
  checking: KEY_CHECKING,
  set: KEY_SET,
  none: NO_KEY,
  unknown: KEY_CHECK_FAILED,
};

interface KeyStatusProps {
  readonly stored: Stored;
  readonly onTryAgain: () => void;
}

/** The words for the stored key, a filled dot or hollow ring beside them, and Try again. */
function KeyStatus({ stored, onTryAgain }: KeyStatusProps) {
  // In high contrast a fill turns into the background, so the filled dot is drawn in the text
  // colour there; the hollow ring's edge is kept by the system (HAL-12946).
  const dot =
    stored === "set"
      ? "bg-success forced-color-adjust-none forced-colors:bg-[CanvasText]"
      : "border border-fg-muted";
  return (
    <p role="status" className="flex items-center gap-2">
      {stored === "set" || stored === "none" ? (
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${dot}`} />
      ) : null}
      {STATUS_LINE[stored]}
      {stored === "unknown" ? (
        <Button variant="ghost" onClick={onTryAgain}>
          {TRY_AGAIN}
        </Button>
      ) : null}
    </p>
  );
}

interface KeyConfirmProps {
  readonly kind: Confirm;
  readonly secretName: string;
  readonly returnFocus: () => HTMLElement | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** The question before a stored key is changed or removed. */
function KeyConfirm({ kind, secretName, returnFocus, onConfirm, onCancel }: KeyConfirmProps) {
  const remove = kind === "remove";
  return (
    <Dialog
      title={{ change: "Change key?", save: "Save key?", remove: "Remove key?" }[kind]}
      confirm={{
        label: { change: CHANGE_KEY, save: SAVE_KEY, remove: REMOVE_KEY }[kind],
        variant: remove ? "danger" : "primary",
        busyLabel: remove ? "Removing…" : "Saving…",
      }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <p>
        {
          {
            change: changeQuestion(secretName),
            save: saveUnknownQuestion(secretName),
            remove: removeQuestion(secretName),
          }[kind]
        }
      </p>
    </Dialog>
  );
}

interface HostCommandLineProps {
  readonly lead: string;
  readonly command: boolean;
  readonly secretName: string;
}

/** A sentence that ends with the host command, shown as code. */
function HostCommandLine({ lead, command, secretName }: HostCommandLineProps) {
  return (
    <p>
      {lead}
      {command ? (
        <>
          {" "}
          <code>{hostCommand(secretName)}</code>.
        </>
      ) : null}
    </p>
  );
}
