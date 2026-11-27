import { HandIcon, inlineLinkClasses } from "@halonicjs/studio-kit";
import { useEffect, useId, useState } from "react";
import type { AgentToolOption, ConnectorKeys } from "../api.ts";
import { mapWords } from "../map/map-words.ts";
import { ChangeKeyDialog } from "./change-key-dialog.tsx";
import { connectorKeyWords as words } from "./connector-key-words.ts";

/**
 * The approval hand on a connector's chip, with the words the agent map's card says
 * (`agents.map.asks-first`): connectors, tool approvals and secrets are important settings, so the
 * Tools page shows which tools ask first too (flow-agents 5.2). Nothing for a skill or knowledge,
 * whose `withoutAsking` is absent.
 */
export function AsksFirst({ withoutAsking }: { readonly withoutAsking: number | undefined }) {
  if (withoutAsking === undefined) return null;
  return (
    <span className="inline-flex items-center gap-1 text-caption font-medium text-warning">
      <span aria-hidden="true" className="inline-grid size-icon-sm shrink-0 *:size-full">
        <HandIcon />
      </span>
      {mapWords.asksFirst(withoutAsking)}
    </span>
  );
}

/** The props of {@link ConnectorKeyLines}. */
export interface ConnectorKeyLinesProps {
  /** The ids of the connectors the agent's file names. */
  readonly chosen: readonly string[];
  /** The connectors the hub can use; `undefined` while the Library can't be read. */
  readonly options: readonly AgentToolOption[] | undefined;
  /** Absent where keys can't be changed here: the lines then have no **Change key**. */
  readonly keys: ConnectorKeys | undefined;
}

/**
 * Under the Connectors list, a line for each secret the agent's connectors use, by its name and
 * never its value (flow-agents 5.2), each with **Change key**, which asks before it stores a new
 * key. A secret with no key stored yet has no **Change key**: a first key asks nothing (save model
 * 8.2), and isn't set here.
 */
export function ConnectorKeyLines({ chosen, options, keys }: ConnectorKeyLinesProps) {
  const lines = chosen.flatMap((id) => {
    const option = options?.find((each) => each.id === id);
    return (option?.secrets ?? []).map((secret) => ({ connector: option?.name ?? id, secret }));
  });
  const [saved, setSaved] = useState("");
  if (lines.length === 0) return null;
  return (
    <>
      {lines.map(({ connector, secret }) => (
        <KeyLine
          key={`${connector}/${secret}`}
          connector={connector}
          secret={secret}
          keys={keys}
          onChanged={() => setSaved(words.saved(connector))}
        />
      ))}
      <p role="status" className="text-small text-fg-muted">
        {saved}
      </p>
    </>
  );
}

/** One secret's line, and its question while it is open. */
function KeyLine({
  connector,
  secret,
  keys,
  onChanged,
}: {
  readonly connector: string;
  readonly secret: string;
  readonly keys: ConnectorKeys | undefined;
  readonly onChanged: () => void;
}) {
  const lineId = useId();
  const stored = useStored(keys, secret);
  const [asking, setAsking] = useState(false);
  const changeable = keys !== undefined && stored !== false;
  return (
    <>
      <p className="text-caption text-fg-muted">
        <span id={lineId}>{words.usesKey(connector, secret)}</span>
        {changeable && (
          <>
            {" "}
            <button
              type="button"
              aria-label={words.changeKeyFor(secret)}
              aria-describedby={lineId}
              className={inlineLinkClasses}
              onClick={() => setAsking(true)}
            >
              {words.changeKey}
            </button>
          </>
        )}
      </p>
      {changeable && asking && (
        <ChangeKeyDialog
          keys={keys}
          secretName={secret}
          onChanged={() => {
            setAsking(false);
            onChanged();
          }}
          onCancel={() => setAsking(false)}
        />
      )}
    </>
  );
}

/**
 * Whether a key is stored under the secret's name: `undefined` while asking, and when the store
 * couldn't be asked, so **Change key** stays (it asks first either way); `false` only when the
 * store says there is none.
 */
function useStored(keys: ConnectorKeys | undefined, secret: string): boolean | undefined {
  const [stored, setStored] = useState<boolean>();
  useEffect(() => {
    if (keys === undefined) return;
    let current = true;
    keys.stored(secret).then(
      (found) => current && setStored(found),
      () => current && setStored(undefined),
    );
    return () => {
      current = false;
    };
  }, [keys, secret]);
  return stored;
}
