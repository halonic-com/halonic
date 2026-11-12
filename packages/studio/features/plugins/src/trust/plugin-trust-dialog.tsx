import { type PluginTrustSection, pluginTrustContent, pluginTrustSections } from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { Dialog, Disclosure, StatusChip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { originText, type PluginOrigin, quoted, RISK_WORDS } from "../page/page-text.ts";
import { type TrustCheckContent, type TrustSecret, trustCheckContent } from "./trust-check.ts";
import {
  ADDRESSES_SECTION,
  AT,
  CAN_REACH,
  FROM,
  GOES_ONLY_TO,
  HOW,
  IN_STUDIO_LINE,
  IN_STUDIO_SECTION,
  inStudioRow,
  NOT_NOW,
  OUTSIDE_TEXT,
  PROGRAMS_SECTION,
  RUNS,
  RUNS_IN_SANDBOX,
  SECRETS_SECTION,
  type SecretKind,
  secretValueLine,
  sectionRow,
  sourceLead,
  THE_PROGRAM,
  TOOLS_INTRO,
  TOOLS_SECTION,
  TRUST_CHECK_LAST_LINE,
  TRUSTING,
  type TrustCheckReason,
  trustButton,
  trustNotSavedLine,
  trustSummary,
  trustTitle,
  VERSION,
} from "./trust-text.ts";

/** The props of `PluginTrustDialog`. */
export interface PluginTrustDialogProps {
  readonly manifest: Plugin;
  /** Where it was added from; a plugin put in the folder by hand has none. */
  readonly origin: PluginOrigin | undefined;
  readonly reason: TrustCheckReason;
  /** While trust is being saved: the primary is busy and keeps focus. */
  readonly busy?: boolean;
  /** Why trust wasn't saved, from the host; the dialog stays open. */
  readonly failure?: string | undefined;
  readonly onTrust: () => void;
  /** **Not now** and Escape: the plugin stays off. */
  readonly onNotNow: () => void;
}

/**
 * A plugin's trust check (design section 5, UX checklist 4, T16-F5 to F8): the kit Dialog md
 * without ✕, **Not now** focused, Escape is Not now. Title, source line and the summary in risk
 * order, then the sections that have something, then the last line. Which sections show, and in
 * which order, comes from core's `pluginTrustSections`, as `halonic plugin add` reads them
 * (`app.plugin-trust-sections`). Every word that acts is
 * Halonic's; the plugin's names, descriptions and titles are plain text, and no secret's value is
 * ever on it.
 *
 * @example
 * <PluginTrustDialog manifest={weather} origin={origin} reason="review"
 *   onTrust={trust} onNotNow={close} />
 */
export function PluginTrustDialog(props: PluginTrustDialogProps) {
  const { manifest, reason } = props;
  const content = trustCheckContent(manifest);
  const summary = trustSummary(content.counts);
  return (
    <Dialog
      title={trustTitle(reason, manifest.name)}
      size="md"
      closeButton={false}
      cancelLabel={NOT_NOW}
      footnote={TRUST_CHECK_LAST_LINE}
      confirm={{ label: trustButton(reason), busyLabel: TRUSTING }}
      busy={props.busy ?? false}
      {...(props.failure === undefined ? {} : { error: trustNotSavedLine(props.failure) })}
      onConfirm={props.onTrust}
      onCancel={props.onNotNow}
    >
      <div className="flex flex-col gap-3">
        <SourceLine version={manifest.version} origin={props.origin} />
        {summary === "" ? null : <p className="text-body text-fg">{summary}</p>}
        <Sections content={content} shown={shownSections(manifest)} name={manifest.name} />
      </div>
    </Dialog>
  );
}

/** "Plugin · version 1.2.0 · from github.com/example/halonic-weather at `3f9c2a1`". */
function SourceLine({
  version,
  origin,
}: {
  readonly version: string;
  readonly origin: PluginOrigin | undefined;
}) {
  return (
    <p className="text-small text-fg-muted wrap-anywhere">
      {sourceLead(version)}
      {origin === undefined ? null : (
        <>
          {FROM}
          {origin.kind === "folder" ? (
            <code className="font-mono">{originText(origin)}</code>
          ) : (
            <>
              {originText(origin)}
              {AT}
              <code className="font-mono">{origin.commit}</code>
            </>
          )}
        </>
      )}
    </p>
  );
}

/** The sections the check shows, in order. Which sections show doesn't depend on the files. */
function shownSections(manifest: Plugin): PluginTrustSection[] {
  return pluginTrustSections(pluginTrustContent({ plugin: manifest, files: [] }));
}

function Sections({
  content,
  shown,
  name,
}: {
  readonly content: TrustCheckContent;
  readonly shown: readonly PluginTrustSection[];
  readonly name: string;
}) {
  return (
    <div className="flex flex-col">
      {shown.map((section) => (
        <Section key={section} section={section} content={content} name={name} />
      ))}
    </div>
  );
}

function Section({
  section,
  content,
  name,
}: {
  readonly section: PluginTrustSection;
  readonly content: TrustCheckContent;
  readonly name: string;
}) {
  const { tools, programs, secrets, addresses, inStudio, counts } = content;
  switch (section) {
    case "tools":
      return (
        <Disclosure
          summary={sectionRow(TOOLS_SECTION, tools.length)}
          defaultOpen={counts.writes + counts.sends > 0}
        >
          <p className="text-small text-fg-muted">{TOOLS_INTRO}</p>
          <Items>
            {tools.map((tool, index) => (
              // Two programs may offer a tool with the same name; the order never changes.
              <li key={index} className="flex flex-col gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <code className="font-mono text-small wrap-anywhere">{tool.name}</code>
                  <StatusChip tone="neutral">{RISK_WORDS[tool.risk]}</StatusChip>
                </span>
                <span className="text-small text-fg-muted wrap-anywhere">
                  {quoted(tool.description)}
                  {tool.untrusted ? ` · ${OUTSIDE_TEXT}` : null}
                </span>
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    case "programs":
      return (
        <Disclosure summary={sectionRow(PROGRAMS_SECTION, programs.length)}>
          <Items>
            {programs.map((program) => (
              <li key={program.id} className="flex flex-col gap-1">
                <code className="font-mono text-small wrap-anywhere">{program.command}</code>
                <Labelled label={RUNS}>{RUNS_IN_SANDBOX}</Labelled>
                {program.version === undefined ? null : (
                  <Labelled label={VERSION}>{program.version}</Labelled>
                )}
                {program.canReach.length === 0 ? null : (
                  <Labelled label={CAN_REACH}>{program.canReach.join(", ")}</Labelled>
                )}
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    case "secrets":
      return (
        <Disclosure summary={sectionRow(SECRETS_SECTION, secrets.length)}>
          <Items>
            {secrets.map((secret, index) => (
              <li key={index} className="flex flex-col gap-1">
                <code className="font-mono text-small wrap-anywhere">{secret.name}</code>
                <Labelled label={GOES_ONLY_TO}>{secret.goesTo.join(", ")}</Labelled>
                {secret.how === undefined ? null : <Labelled label={HOW}>{secret.how}</Labelled>}
              </li>
            ))}
          </Items>
          {secretKinds(secrets).map((kind) => (
            <p key={kind} className="text-small text-fg-muted">
              {secretValueLine(name, kind)}
            </p>
          ))}
        </Disclosure>
      );
    case "addresses":
      return (
        <Disclosure summary={sectionRow(ADDRESSES_SECTION, addresses.length)}>
          <Items>
            {addresses.map((address) => (
              <li key={address.address} className="text-small wrap-anywhere">
                <code className="font-mono">{address.address}</code>
                {address.program ? <span className="text-fg-muted"> {THE_PROGRAM}</span> : null}
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    case "in-studio":
      return (
        <Disclosure
          label={IN_STUDIO_SECTION}
          summary={inStudioRow({
            settings: inStudio.settings,
            commands: inStudio.commands.length,
            cards: inStudio.cards.length,
            panel: inStudio.panel !== undefined,
          })}
          tone="value"
        >
          <p className="text-small text-fg-muted">{IN_STUDIO_LINE}</p>
          <Items>
            {[
              ...inStudio.commands,
              ...inStudio.cards,
              ...(inStudio.panel === undefined ? [] : [inStudio.panel]),
            ].map((title, index) => (
              <li key={index} className="text-small wrap-anywhere">
                {title}
              </li>
            ))}
          </Items>
        </Disclosure>
      );
  }
}

function Items({ children }: { readonly children: ReactNode }) {
  return <ul className="mt-2 mb-3 flex list-none flex-col gap-3">{children}</ul>;
}

/** The kinds of secret the plugin has, backend first, each once. */
function secretKinds(secrets: readonly TrustSecret[]): SecretKind[] {
  return (["backend", "program"] as const).filter((kind) =>
    secrets.some((secret) => secret.kind === kind),
  );
}

/** A label over its value, as the design's open rows show them. */
function Labelled({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <p className="text-small wrap-anywhere">
      <span className="text-fg-muted">{label} </span>
      {children}
    </p>
  );
}
