import { Callout, inlineLinkClasses, ViewOnlyLine } from "@halonicjs/studio-kit";
import type { SettingsSurface } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import type { AssistantWorkspaceFacts } from "../api.ts";
import type { AssistantProvider } from "./assistant-providers.ts";
import * as text from "./assistant-text.ts";

/** The line under the warning when the open workspace sets its own model, with its link unless served. */
export function SetsItsOwn({
  open,
  link,
}: {
  readonly open: AssistantWorkspaceFacts | null;
  readonly link: (() => void) | null;
}) {
  if (open === null || open.sessionModel === null) return null;
  return (
    <p className="text-small text-fg-muted">
      {text.setsItsOwn(open.name, open.sessionModel)}
      {link === null ? null : (
        <>
          {" "}
          <button type="button" className={inlineLinkClasses} onClick={link}>
            {text.WORKSPACE_SETTINGS}
          </button>
        </>
      )}
    </p>
  );
}

/** The words of the local-only warning, or `null` when the chosen model may be used in the open workspace. */
export function localOnlyWarningLine(
  open: AssistantWorkspaceFacts | null,
  provider: AssistantProvider,
  local: boolean,
): string | null {
  if (provider === "not-set-up" || !open?.localOnly || local) return null;
  return text.localOnlyWarning(open.name);
}

/**
 * The warning when the open workspace is local only and the chosen cloud model isn't marked Local.
 * `id` lets the Provider select name it as its description (HAL-12536).
 */
export function LocalOnlyWarning(props: {
  readonly open: AssistantWorkspaceFacts | null;
  readonly provider: AssistantProvider;
  readonly local: boolean;
  readonly id?: string;
}) {
  const line = localOnlyWarningLine(props.open, props.provider, props.local);
  if (line === null) return null;
  return (
    <div id={props.id}>
      <Callout tone="warning">{line}</Callout>
    </div>
  );
}

/**
 * Says the local-only warning once, politely, when a change brings it up. It shows above the
 * Provider select while focus stays on the select, so without this nothing is read (HAL-12536).
 * A section that opens with the warning already there doesn't say it: it's read in page order.
 */
export function useLocalOnlyAnnouncement(
  line: string | null,
  announce: (line: string) => void,
): void {
  const shownBefore = useRef(line !== null);
  useEffect(() => {
    if (line !== null && !shownBefore.current) announce(line);
    shownBefore.current = line !== null;
  }, [line, announce]);
}

/** The view-only line, then what the section says about Not set up and a local-only workspace. */
export function ViewOnlyNotes(props: {
  readonly surface: SettingsSurface | undefined;
  readonly provider: AssistantProvider;
  readonly open: AssistantWorkspaceFacts | null;
  readonly local: boolean;
}) {
  const { surface, provider, open, local } = props;
  return (
    <>
      <ViewOnlyLine>
        {surface === "phone" ? text.VIEW_ONLY_PHONE_LINE : text.VIEW_ONLY_LINE}
      </ViewOnlyLine>
      {provider === "not-set-up" ? (
        <p className="text-small text-fg-muted">{text.NOT_SET_UP_LINE}</p>
      ) : null}
      <LocalOnlyWarning open={open} provider={provider} local={local} />
    </>
  );
}
