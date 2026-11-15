import { Button, Dialog, Field, Input, SecretText } from "@halonicjs/studio-kit";
import { useEffect, useRef, useState } from "react";
import type { KeyEntry, ModelKeys } from "../api.ts";
import {
  CHANGE_KEY,
  changeQuestion,
  KEY_CHECK_FAILED,
  KEY_CHECKING,
  KEY_HEADING,
  KEY_REMOVE_FAILED,
  KEY_REMOVED_LINE,
  KEY_SAVE_FAILED,
  KEY_SAVED_LINE,
  KEY_SET,
  keptLine,
  NEEDS_SECRET_NAME,
  NO_KEY,
  offHostHttpsLine,
  REMOVE_KEY,
  removeQuestion,
  SAVE_KEY,
  unavailableLine,
} from "./key-text.ts";

/** The props of {@link KeyBlock}. */
export interface KeyBlockProps {
  readonly keys: ModelKeys;
  /** The provider's `secret:` name; `undefined` when it has none. */
  readonly secretName: string | undefined;
}

/** What the block knows about the stored key; `unknown` after a failed check. */
type Stored = "checking" | "set" | "none" | "unknown";

/** Whether a key is stored under the secret name, read when the provider changes. */
function useStoredKey(
  keys: ModelKeys,
  secretName: string | undefined,
): [Stored, (stored: Stored) => void] {
  const [stored, setStored] = useState<Stored>("checking");
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
  }, [keys, secretName]);
  return [stored, setStored];
}

/** What is being asked in the open confirm. */
type Confirm = "change" | "remove";

/**
 * The key block of a provider's page (`models.api-keys.*`): whether a key is stored, a masked
 * field that never shows or returns the key, and **Save key** and **Remove key**, each asking
 * first when a key is already stored. The typed key lives in the input only; it becomes a
 * `SecretText` for the one request that stores it and the input is cleared when that succeeds.
 *
 * @example
 * <KeyBlock keys={keys} secretName={provider.secret} />
 */
export function KeyBlock({ keys, secretName }: KeyBlockProps) {
  const { entry } = keys;
  if (entry.kind === "unavailable") {
    return (
      <section aria-labelledby="key-heading" className="flex flex-col gap-1">
        <h2 id="key-heading" className="text-heading">
          {KEY_HEADING}
        </h2>
        <p>{unavailableLine(entry.reason, secretName ?? "<name>")}</p>
      </section>
    );
  }
  return <KeyField keys={keys} entry={entry} secretName={secretName} />;
}

interface KeyFieldProps extends KeyBlockProps {
  readonly entry: Extract<KeyEntry, { kind: "field" }>;
}

/** The status, the field and the buttons, for a Studio where a key can be typed. */
function KeyField({ keys, entry, secretName }: KeyFieldProps) {
  const input = useRef<HTMLInputElement>(null);
  const [stored, setStored] = useStoredKey(keys, secretName);
  const [hasText, setHasText] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Confirm>();
  const [problem, setProblem] = useState<string>();
  const [done, setDone] = useState("");

  async function run(action: () => Promise<void>, failure: string, line: string) {
    setBusy(true);
    setProblem(undefined);
    setDone("");
    try {
      await action();
      setDone(line);
      return true;
    } catch {
      // The error never repeats the key, and neither does this line.
      setProblem(failure);
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
      KEY_SAVE_FAILED,
      KEY_SAVED_LINE,
    );
    if (!saved) return;
    if (input.current !== null) input.current.value = "";
    setHasText(false);
    setStored("set");
  }

  async function remove() {
    if (secretName === undefined) return;
    if (await run(() => keys.remove(secretName), KEY_REMOVE_FAILED, KEY_REMOVED_LINE)) {
      setStored("none");
    }
  }

  function save() {
    if (!hasText || busy) return;
    if (stored === "set") setConfirm("change");
    else void send();
  }

  const status = { checking: KEY_CHECKING, set: KEY_SET, none: NO_KEY, unknown: KEY_CHECK_FAILED };
  return (
    <section aria-labelledby="key-heading" className="flex flex-col gap-2">
      <h2 id="key-heading" className="text-heading">
        {KEY_HEADING}
      </h2>
      {secretName === undefined ? (
        <p>{NEEDS_SECRET_NAME}</p>
      ) : (
        <>
          {entry.offHostHttps ? <p>{offHostHttpsLine(secretName)}</p> : null}
          <p role="status">{status[stored]}</p>
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
                  onChange={(event) => setHasText(event.target.value.trim() !== "")}
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
                void (confirm === "change" ? send() : remove());
              }}
              onCancel={() => setConfirm(undefined)}
            />
          )}
        </>
      )}
    </section>
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
  const change = kind === "change";
  return (
    <Dialog
      title={change ? "Change key?" : "Remove key?"}
      confirm={{
        label: change ? CHANGE_KEY : REMOVE_KEY,
        variant: change ? "primary" : "danger",
        busyLabel: "Saving…",
      }}
      onConfirm={onConfirm}
      onCancel={onCancel}
      returnFocus={returnFocus}
    >
      <p>{change ? changeQuestion(secretName) : removeQuestion(secretName)}</p>
    </Dialog>
  );
}
