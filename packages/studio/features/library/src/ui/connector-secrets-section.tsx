import { Button, Field, Input, StatusChip } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useId, useRef, useState } from "react";
import {
  type ConnectorSecretState,
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
}

/**
 * A connector's secrets on its page, in the keychain the agent host's connector reads them from
 * (HAL-14995), as the plugin secret fields in Settings work: each shows "Set" or "Not set", an
 * entry that never shows what's stored and saves when you leave it, and **Remove** once one is
 * stored. The page only learns whether a value is stored, never the value.
 *
 * @example
 * <ConnectorSecretsSection secrets={keychain} names={["NOTES_TOKEN"]} sourceName="Notes" />
 */
export function ConnectorSecretsSection({
  secrets,
  names,
  sourceName,
}: ConnectorSecretsSectionProps) {
  const headingId = useId();
  const [states, setStates] = useState<Readonly<Record<string, ConnectorSecretState>>>({});
  // The names joined, so a new array with the same names doesn't read the keychain again.
  const nameList = names.join("\n");
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
    })();
    return () => {
      current = false;
    };
  }, [secrets, nameList]);

  if (names.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <h2 id={headingId} className="text-heading text-fg">
        {words.heading}
      </h2>
      {names.map((name) => (
        <SecretRow
          key={name}
          name={name}
          sourceName={sourceName}
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
  readonly secrets: ConnectorSecrets;
  readonly state: ConnectorSecretState;
  readonly onState: (state: ConnectorSecretState) => void;
}

/** One secret: its state, an entry that never shows what's stored, and **Remove** once it is set. */
function SecretRow({ name, sourceName, secrets, state, onState }: SecretRowProps) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (draft === "") return;
    try {
      await secrets.set(name, draft);
      setDraft("");
      setError(null);
      onState("set");
    } catch (failure) {
      // The reason is the store's, whose messages never repeat the value.
      setError(words.notSaved(errorReasonFor(failure), state === "set"));
    }
  }

  async function remove() {
    try {
      await secrets.remove(name);
      setError(null);
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
      <span className="block">{words.storedLine(sourceName)}</span>
    </>
  );
  return (
    <div className="flex flex-col gap-1">
      <Field label={name} hint={hint} error={error}>
        <Input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={state === "set" ? words.replacePlaceholder : undefined}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={() => void save()}
        />
      </Field>
      {state === "set" ? (
        <div className="self-start">
          <Button variant="ghost" size="sm" onClick={() => void remove()}>
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
