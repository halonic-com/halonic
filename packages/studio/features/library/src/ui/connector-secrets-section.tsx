import { Button, Field, Input, StatusChip } from "@halonicjs/studio-kit";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { useEffect, useId, useState } from "react";
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

  useEffect(() => {
    if (nameList === "") return;
    let current = true;
    void (async () => {
      const read = await secretStates(secrets, nameList.split("\n"));
      if (current) setStates(read);
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
          onState={(state) => setStates((now) => ({ ...now, [name]: state }))}
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
