import { isHalonicSecretName, isPluginSecretName } from "@halonicjs/ports";
import { Button, Field, Input, StatusChip } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import {
  type ConnectorSecretState,
  type LocalConnectorKind,
  type ReservedSecretOwner,
  connectorSecretWords as words,
} from "../connector-secret-words.ts";
import type { ConnectorSecrets } from "../connector-secrets-host.ts";

/** Props for {@link ConnectorSecretsSection}. */
export interface ConnectorSecretsSectionProps {
  readonly secrets: ConnectorSecrets;
  /** The names of the secrets the connector's file declares. */
  readonly names: readonly string[];
  /** The connector's name, for the line about who gets the secret. */
  readonly sourceName: string;
  /** Which kind of connector it is, since that changes who it gives the secret to. */
  readonly kind: LocalConnectorKind;
  /**
   * For the trouble line's **Paste a new token**: the first secret's entry takes focus when this
   * says yes. A new function asks again; one asked before the keychain answered is taken once the
   * entry shows. It answers yes once per press, so an entry drawn again later doesn't take focus.
   */
  readonly takeFocus?: (() => boolean) | undefined;
}

/**
 * A connector's secrets on its page, in the keychain the agent host's connector reads them from
 * (HAL-14995), as the plugin secret fields in Settings work: each shows "Set" or "Not set", an
 * entry that never shows what's stored and saves on Enter or when you leave it, and **Remove**
 * once one is stored. The page only learns whether a value is stored, never the value.
 *
 * @example
 * <ConnectorSecretsSection secrets={keychain} names={["NOTES_TOKEN"]} sourceName="Notes" kind="stdio" />
 */
export function ConnectorSecretsSection({
  secrets,
  names,
  sourceName,
  kind,
  takeFocus,
}: ConnectorSecretsSectionProps) {
  const headingId = useId();
  const [states, setStates] = useState<Readonly<Record<string, ConnectorSecretState>>>({});
  // The names joined, so a new array with the same names doesn't read the keychain again.
  const nameList = names.join("\n");
  // The names the keychain last answered for: nothing shows until it has answered for these.
  const [answeredFor, setAnsweredFor] = useState<string | undefined>(undefined);
  // Saves and removes so far, and the count at each name's latest one, so a check that started
  // before a save or remove doesn't put back the state that save or remove replaced.
  const changes = useRef({ count: 0, latest: new Map<string, number>() });

  function changed(name: string, state: ConnectorSecretState) {
    changes.current.count += 1;
    changes.current.latest.set(name, changes.current.count);
    setStates((now) => ({ ...now, [name]: state }));
  }

  useEffect(() => {
    if (nameList === "") return;
    let current = true;
    const startedAfter = changes.current.count;
    void (async () => {
      const read = await secretStates(secrets, nameList.split("\n"));
      if (!current) return;
      setStates((now) => answersStillCurrent(read, now, changes.current.latest, startedAfter));
      setAnsweredFor(nameList);
    })();
    return () => {
      current = false;
    };
  }, [secrets, nameList]);

  // Nothing until the keychain has answered for these names, as the plugin fields in Settings,
  // so a stored secret never shows "Not set" first (C551 S6).
  if (names.length === 0 || answeredFor !== nameList) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-heading text-fg">
        {words.heading}
      </h2>
      {names.map((name, index) => (
        <SecretRow
          key={name}
          takeFocus={index === 0 ? takeFocus : undefined}
          name={name}
          sourceName={sourceName}
          kind={kind}
          secrets={secrets}
          state={states[name] ?? "not-set"}
          onState={(state) => changed(name, state)}
        />
      ))}
    </section>
  );
}

interface SecretRowProps {
  readonly name: string;
  readonly sourceName: string;
  readonly kind: LocalConnectorKind;
  readonly secrets: ConnectorSecrets;
  readonly state: ConnectorSecretState;
  readonly onState: (state: ConnectorSecretState) => void;
  /** See {@link ConnectorSecretsSectionProps.takeFocus}. */
  readonly takeFocus: (() => boolean) | undefined;
}

/** One secret: its state, an entry that never shows what's stored, and **Remove** once it is set. */
function SecretRow({ name, sourceName, kind, secrets, state, onState, takeFocus }: SecretRowProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const entry = useRef<HTMLInputElement>(null);
  const removeButton = useRef<HTMLButtonElement>(null);
  // Set by a Remove that worked: **Remove** goes with the value, so focus goes to the entry once
  // it says "Not set", where typing the value again undoes it (C551 S3).
  const focusEntry = useRef(false);
  // Set by Tab out of an entry that says "Not set": **Remove** only shows once the value is saved,
  // after focus has left the page, so a save that worked hands focus to it, where Tab would have
  // gone had it been there (C605 #6a).
  const tabbedOut = useRef(false);
  const focusRemove = useRef(false);
  // A save in flight, so Tab after Enter doesn't save the same value twice.
  const saving = useRef(false);
  useEffect(() => {
    if (takeFocus?.()) entry.current?.focus();
  }, [takeFocus]);

  useEffect(() => {
    if (focusEntry.current) {
      focusEntry.current = false;
      entry.current?.focus();
    }
    if (focusRemove.current && state === "set") {
      focusRemove.current = false;
      removeButton.current?.focus();
    }
  }, [state]);

  async function save() {
    const leftWithTab = tabbedOut.current;
    tabbedOut.current = false;
    if (draft === "" || saving.current) return;
    saving.current = true;
    try {
      await saveDraft(leftWithTab);
    } finally {
      saving.current = false;
    }
  }

  async function saveDraft(leftWithTab: boolean) {
    // The store refuses this name too, but with no reason Studio may show; the page says whose it
    // is and what to do instead. No value can be saved under it, so the entry lets go of this one.
    const owner = reservedOwner(name);
    if (owner !== null) {
      setDraft("");
      setError(words.refusedName(owner));
      return;
    }
    try {
      await secrets.set(name, draft);
      setDraft("");
      setError(null);
      focusRemove.current = leftWithTab;
      onState("set");
    } catch (failure) {
      // The value isn't kept on the page, even masked, so the entry lets go of it (C552 finding 6).
      // The reason is the store's, whose messages never repeat the value.
      setDraft("");
      setError(words.notSaved(errorReasonFor(failure), state === "set"));
    }
  }

  async function remove() {
    try {
      await secrets.remove(name);
      setError(null);
      focusEntry.current = true;
      onState("not-set");
    } catch (failure) {
      setError(words.notRemoved(errorReasonFor(failure)));
    }
  }

  const hint = (
    <>
      <StatusChip tone={state === "not-set" ? "attention" : "neutral"}>
        {words.state[state]}
      </StatusChip>{" "}
      <span className="block">{words.storedLine(sourceName, kind)}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-1">
      <Field label={name} hint={hint} error={error}>
        <Input
          ref={entry}
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={state === "set" ? words.replacePlaceholder : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // Enter saves too, and focus stays in the entry, which then says "Set" (C605 #6a).
            if (event.key === "Enter") {
              event.preventDefault();
              void save();
            }
            if (event.key === "Tab") tabbedOut.current = !event.shiftKey && state !== "set";
          }}
          onBlur={() => void save()}
        />
      </Field>
      {state === "set" ? (
        <div className="self-start">
          <Button ref={removeButton} variant="ghost" size="sm" onClick={() => void remove()}>
            {words.remove}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The states a check read, except for a secret saved or removed after the check started: that
 * one keeps the state the save or remove gave it, which is newer than the check's answer.
 */
function answersStillCurrent(
  read: Readonly<Record<string, ConnectorSecretState>>,
  now: Readonly<Record<string, ConnectorSecretState>>,
  latestChange: ReadonlyMap<string, number>,
  startedAfter: number,
): Record<string, ConnectorSecretState> {
  const states: Record<string, ConnectorSecretState> = { ...read };
  for (const [name, change] of latestChange) {
    const kept = now[name];
    if (change > startedAfter && kept !== undefined) states[name] = kept;
  }
  return states;
}

/**
 * Who a name no workspace may pick belongs to, or `null` when the workspace may pick it. A name
 * that breaks the secret name rule is `null` here, and the store gives the reason.
 */
function reservedOwner(name: string): ReservedSecretOwner | null {
  try {
    if (isHalonicSecretName(name)) return "halonic";
    if (isPluginSecretName(name)) return "plugin";
  } catch {
    // Not a secret name at all: the store refuses it with its own reason.
  }
  return null;
}

/**
 * Whether each secret has a value in the keychain. One the keychain can't read is `unknown`,
 * never "not set". The keychain answers yes or no, never the value.
 */
async function secretStates(
  secrets: ConnectorSecrets,
  names: readonly string[],
): Promise<Record<string, ConnectorSecretState>> {
  const states: Record<string, ConnectorSecretState> = {};
  for (const name of names) {
    try {
      states[name] = (await secrets.has(name)) ? "set" : "not-set";
    } catch (error) {
      console.error("Couldn't check whether a connector's secret is set.", error);
      states[name] = "unknown";
    }
  }
  return states;
}
