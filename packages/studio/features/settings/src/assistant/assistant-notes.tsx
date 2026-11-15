import { Callout, inlineLinkClasses, ViewOnlyLine } from "@halonicjs/studio-kit";
import type { SettingsSurface } from "@halonicjs/studio-shell";
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

/** The warning when the open workspace is local only and the chosen cloud model isn't marked Local. */
export function LocalOnlyWarning(props: {
  readonly open: AssistantWorkspaceFacts | null;
  readonly provider: AssistantProvider;
  readonly local: boolean;
}) {
  const { open, provider, local } = props;
  if (provider === "not-set-up" || !open?.localOnly || local) return null;
  return <Callout tone="warning">{text.localOnlyWarning(open.name)}</Callout>;
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
