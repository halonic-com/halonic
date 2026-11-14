import { inlineLinkClasses, SkeletonBar } from "@halonicjs/studio-kit";
import { useEffect, useState } from "react";
import type { AssistantNavigation, AssistantWorkspace, AssistantWorkspaceFacts } from "../api.ts";
import type { AssistantProvider } from "./assistant-providers.ts";
import * as text from "./assistant-text.ts";

/** The props of {@link KeyLine}. */
export interface KeyLineProps {
  /** A provider that is set: Not set up has no key line. */
  readonly provider: Exclude<AssistantProvider, "not-set-up">;
  readonly secretName: string;
  readonly workspace: AssistantWorkspace | undefined;
  /** Where the links lead; without it the line has none. */
  readonly navigate?: AssistantNavigation | undefined;
  /** The open workspace, or `null`. */
  readonly open: AssistantWorkspaceFacts | null;
  /** Closes Settings before a link opens a page. */
  readonly closeSettings: () => void;
  /** Served to another device: the line says where the key is and has no link. */
  readonly served?: boolean;
}

type Stored = "checking" | "yes" | "no" | "unknown";

function link(label: React.ReactNode, onPress: () => void) {
  return (
    <button type="button" className={inlineLinkClasses} onClick={onPress}>
      {label}
    </button>
  );
}

/**
 * The key line: whether a key is stored under the Assistant's secret name, as a word and never as
 * colour alone. It is a line, not a field: keys are entered on the provider page only
 * (`settings.ai-agent-key-line`).
 *
 * @example
 * <KeyLine provider="anthropic" secretName="anthropic-api-key" workspace={w} open={w.current()} closeSettings={close} />
 */
export function KeyLine(props: KeyLineProps) {
  const { secretName, workspace, open, served = false } = props;
  const stored = useKeyStored(workspace, secretName, served || open !== null, open);
  return (
    <div>
      <div className="text-small text-fg-muted">{text.KEY}</div>
      <p className="text-body">{keyLineContent(props, stored)}</p>
    </div>
  );
}

const keySet = (
  <>
    <span aria-hidden="true">{text.KEY_SET_MARK}</span> {text.KEY_SET}
  </>
);
const keyMissing = (
  <>
    <span aria-hidden="true">{text.KEY_MISSING_MARK}</span> {text.KEY_MISSING}
  </>
);

/** What the line says for the key's state. The links show only where the navigation has them. */
function keyLineContent(props: KeyLineProps, stored: Stored): React.ReactNode {
  const { secretName, workspace, open, served = false } = props;
  if (secretName === "") return text.KEY_NOT_NEEDED;
  if (workspace === undefined || (!served && open === null)) {
    return (
      <>
        {keyMissing}. {text.KEY_NO_WORKSPACE}
      </>
    );
  }
  if (stored === "checking") return <SkeletonBar kind="title" width="1/2" />;
  if (stored === "unknown") return text.KEY_UNKNOWN;
  if (served) return stored === "yes" ? text.KEY_SERVED_SET : text.KEY_SERVED_MISSING;
  return keyActions(props, stored);
}

/** The line once the key's state is known and Settings isn't served: the word and its link. */
function keyActions(props: KeyLineProps, stored: Stored): React.ReactNode {
  const { provider, secretName, navigate, open, closeSettings } = props;
  const press = (go: () => void) => () => {
    closeSettings();
    go();
  };
  const providerPage = navigate?.openProviderPage;
  const addProvider = navigate?.addProvider;
  if (stored === "yes" || open?.usesSecret(secretName)) {
    const label = stored === "yes" ? text.KEY_REPLACE : text.KEY_ADD;
    return (
      <>
        {stored === "yes" ? keySet : keyMissing}
        {providerPage ? (
          <>
            {" "}
            ·{" "}
            {link(
              label,
              press(() => providerPage(secretName)),
            )}
          </>
        ) : null}
      </>
    );
  }
  const [before, after] = text.keyAddProvider(open?.name ?? "");
  const sentence = (
    <>
      {before}
      <code>{secretName}</code>
      {after}
    </>
  );
  return (
    <>
      {keyMissing}.{" "}
      {addProvider ? (
        link(
          <>{sentence} ›</>,
          press(() => addProvider(provider, secretName)),
        )
      ) : (
        <>{sentence}.</>
      )}
    </>
  );
}

/** Asks the workspace whether the key is stored, again when the workspace changes. */
function useKeyStored(
  workspace: AssistantWorkspace | undefined,
  secretName: string,
  canAsk: boolean,
  open: AssistantWorkspaceFacts | null,
): Stored {
  const [answer, setAnswer] = useState<{ readonly name: string; readonly stored: Stored }>({
    name: secretName,
    stored: "checking",
  });
  const asks = secretName !== "" && workspace !== undefined && canAsk;
  // `open` is only a reason to ask again when the workspace changes.
  useEffect(() => {
    if (!asks) return;
    let current = true;
    setAnswer({ name: secretName, stored: "checking" });
    workspace.keyStored(secretName).then(
      (yes) => current && setAnswer({ name: secretName, stored: yes ? "yes" : "no" }),
      () => current && setAnswer({ name: secretName, stored: "unknown" }),
    );
    return () => {
      current = false;
    };
  }, [asks, workspace, secretName, open]);
  // An answer for another secret name is stale: show the wait until the new one comes.
  return answer.name === secretName ? answer.stored : "checking";
}
