import type { RunnerUnfencedReason } from "@halonicjs/app";
import {
  type PluginTrustFiles,
  type PluginTrustSection,
  pluginTrustContent,
  pluginTrustSections,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { Callout, Dialog, Disclosure, StatusChip } from "@halonicjs/studio-kit";
import { originText, type PluginOrigin, RISK_WORDS } from "../page/page-text.ts";
import { Quoted } from "../ui/quoted.tsx";
import type { ChangeRow, PluginChangeSummary } from "./change-rows.ts";
import { Items, Labelled, Location } from "./plugin-location.tsx";
import { ProgramsSection } from "./programs-section.tsx";
import {
  addressesLine,
  type PluginCode,
  type TrustFence,
  trustLastLine,
  type UnfencedYes,
} from "./runs-line.ts";
import { Checking, LastLine, useUnfencedYes } from "./runs-line-parts.tsx";
import { type TrustCheckContent, type TrustSecret, trustCheckContent } from "./trust-check.ts";
import {
  ADDRESSES_SECTION,
  ARROW,
  AT,
  CHANGED_INTRO,
  CHANGED_UNREADABLE,
  FROM,
  GOES_ONLY_TO,
  HOW,
  IN_STUDIO_LINE,
  IN_STUDIO_SECTION,
  inStudioRow,
  keepButton,
  NOT_NOW,
  OUTSIDE_TEXT,
  type ProgramsRun,
  SECRETS_SECTION,
  type SecretKind,
  SIGN_INS_SECTION,
  secretValueLine,
  sectionRow,
  sourceLead,
  THE_PROGRAM,
  TOOLS_INTRO,
  TOOLS_SECTION,
  TRUSTING,
  type TrustCheckReason,
  trustButton,
  trustNotSavedLine,
  trustSummary,
  trustTitle,
  unchangedRow,
  updateNotSavedLine,
} from "./trust-text.ts";

/** The props of `PluginTrustDialog`. */
export interface PluginTrustDialogProps {
  readonly manifest: Plugin;
  /** Where it was added from; a plugin put in the folder by hand has none. */
  readonly origin: PluginOrigin | undefined;
  readonly reason: TrustCheckReason;
  /** The plugin folder's real path, shown under Folder; the line is left out when unsaid. */
  readonly folder?: string | undefined;
  /** The files the fingerprint covers, shown under Files. */
  readonly files?: PluginTrustFiles | undefined;
  /** For `reason="changed"`: what changed, and the day the person trusted the plugin before. */
  readonly changes?: PluginChangeSummary | undefined;
  readonly trustedOn?: string | undefined;
  /** While trust is being saved: the primary is busy and keeps focus. */
  readonly busy?: boolean;
  /** Why trust wasn't saved, from the host; the dialog stays open. */
  readonly failure?: string | undefined;
  /**
   * For `reason="update"`: the version the person has now, which **Keep** names, and for a git
   * plugin the newer commit. `manifest` is the new version, `origin` where it comes from now.
   */
  readonly update?: { readonly keep: string; readonly toCommit?: string | undefined } | undefined;
  /** Whether the plugin's programs can run here; when unsaid, the Runs line holds either way. */
  readonly programsRun?: ProgramsRun;
  /**
   * Whether plugin code runs in the sandbox on this computer, read when the check opens (the
   * "Runs" line design section 2). When unsaid, the last line holds either way (T9).
   */
  readonly fence?: TrustFence;
  /** The yes to run without the sandbox saved on this computer, if any (R6). */
  readonly unfencedYes?: UnfencedYes | undefined;
  /**
   * R11b's **Set up the agent sandbox**: closes the check and opens Settings › Agent sandbox.
   * Without it, R11b's fix shows without the link.
   */
  readonly onSetUpSandbox?: (() => void) | undefined;
  /**
   * **Trust**. With the checkbox ticked it gets the reason the person said yes for, which the
   * host saves through the engine's `UnfencedRuns.allow` before it trusts the plugin.
   */
  readonly onTrust: (allowUnfenced?: RunnerUnfencedReason) => void;
  /** **Not now** and Escape, or **Keep** for an update: the plugin stays as it was. */
  readonly onNotNow: () => void;
  /** Where focus goes when the button that opened the dialog is gone. */
  readonly returnFocus?: (() => HTMLElement | null) | undefined;
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
  const { manifest, reason, fence } = props;
  const content = trustCheckContent(manifest);
  const summary = trustSummary(content.counts, props.programsRun);
  const code: PluginCode = {
    backend: manifest.backend !== undefined,
    programs: content.programs.length,
  };
  const yes = useUnfencedYes(fence, code, props.unfencedYes);
  return (
    <Dialog
      title={trustTitle(reason, manifest.name, props.trustedOn, manifest.version)}
      size="md"
      closeButton={false}
      cancelLabel={props.update === undefined ? NOT_NOW : keepButton(props.update.keep)}
      footnote={<LastLine line={trustLastLine(fence, code)} yes={yes} />}
      confirm={{
        label: trustButton(reason),
        busyLabel: TRUSTING,
        ...(yes.unavailable === undefined ? {} : { unavailable: yes.unavailable }),
      }}
      busy={props.busy ?? false}
      {...(props.returnFocus === undefined ? {} : { returnFocus: props.returnFocus })}
      {...(props.failure === undefined
        ? {}
        : {
            error:
              reason === "update"
                ? updateNotSavedLine(props.failure)
                : trustNotSavedLine(props.failure),
          })}
      onConfirm={() => props.onTrust(yes.allow)}
      onCancel={props.onNotNow}
    >
      <div className="flex flex-col gap-3">
        <SourceLine
          version={manifest.version}
          origin={props.origin}
          toCommit={props.update?.toCommit}
        />
        {reason === "changed" || reason === "update" ? (
          <Changes summary={props.changes} intro={reason === "changed"} />
        ) : (
          <>
            {summary === "" ? null : <p className="text-body text-fg">{summary}</p>}
            {fence?.state === "checking" ? <Checking id={yes.checkingId} /> : null}
            <Sections
              content={content}
              shown={shownSections(manifest)}
              name={manifest.name}
              programsRun={props.programsRun}
              fence={fence}
              code={code}
              onSetUpSandbox={props.onSetUpSandbox}
            />
            <Location folder={props.folder} files={props.files} />
          </>
        )}
      </div>
    </Dialog>
  );
}

/** "Plugin · version 1.2.0 · from github.com/example/halonic-weather at `3f9c2a1`". */
function SourceLine({
  version,
  origin,
  toCommit,
}: {
  readonly version: string;
  readonly origin: PluginOrigin | undefined;
  /** An update's newer commit, shown after the one the plugin has: `3f9c2a1 → 8be41d0`. */
  readonly toCommit?: string | undefined;
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
              {toCommit === undefined ? null : (
                <>
                  {ARROW}
                  <code className="font-mono">{toCommit}</code>
                </>
              )}
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
  programsRun,
  fence,
  code,
  onSetUpSandbox,
}: {
  readonly content: TrustCheckContent;
  readonly shown: readonly PluginTrustSection[];
  readonly name: string;
  readonly programsRun: ProgramsRun;
  readonly fence: TrustFence;
  readonly code: PluginCode;
  readonly onSetUpSandbox: (() => void) | undefined;
}) {
  return (
    <div className="flex flex-col">
      {shown.map((section) => (
        <Section
          key={section}
          section={section}
          content={content}
          name={name}
          programsRun={programsRun}
          fence={fence}
          code={code}
          onSetUpSandbox={onSetUpSandbox}
        />
      ))}
    </div>
  );
}

function Section({
  section,
  content,
  name,
  programsRun,
  fence,
  code,
  onSetUpSandbox,
}: {
  readonly section: PluginTrustSection;
  readonly content: TrustCheckContent;
  readonly name: string;
  readonly programsRun: ProgramsRun;
  readonly fence: TrustFence;
  readonly code: PluginCode;
  readonly onSetUpSandbox: (() => void) | undefined;
}) {
  const { tools, programs, secrets, signIns, addresses, inStudio, counts } = content;
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
                  <Quoted text={tool.description} />
                  {tool.untrusted ? ` · ${OUTSIDE_TEXT}` : null}
                </span>
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    case "programs":
      return (
        <ProgramsSection
          programs={programs}
          programsRun={programsRun}
          fence={fence}
          onSetUpSandbox={onSetUpSandbox}
        />
      );
    case "secrets":
      return (
        <Disclosure summary={sectionRow(SECRETS_SECTION, secrets.length)}>
          <Items>
            {secrets.map((secret, index) => (
              <li key={index} className="flex flex-col gap-1">
                <code className="font-mono text-small wrap-anywhere">{secret.name}</code>
                {secret.givenTo === undefined ? (
                  <Labelled label={GOES_ONLY_TO}>{secret.goesTo.join(", ")}</Labelled>
                ) : (
                  <p className="text-small wrap-anywhere">{secret.givenTo}</p>
                )}
                {secret.how === undefined ? null : <Labelled label={HOW}>{secret.how}</Labelled>}
              </li>
            ))}
          </Items>
          {secretKinds(secrets).map((kind) => (
            <p key={kind} className="text-small text-fg-muted">
              {secretValueLine(kind)}
            </p>
          ))}
        </Disclosure>
      );
    case "sign-ins":
      // The words the plugin page shows before **Sign in**, without its buttons (HAL-13419).
      // Opens by itself when a sign-in has the token host warning, so it can't be missed (HAL-14004).
      return (
        <Disclosure
          summary={sectionRow(SIGN_INS_SECTION, signIns.length)}
          defaultOpen={signIns.some((signIn) => signIn.warning !== undefined)}
        >
          <Items>
            {signIns.map((signIn) => (
              <li key={signIn.name} className="flex flex-col gap-1">
                <code className="font-mono text-small wrap-anywhere">{signIn.name}</code>
                <p className="text-small wrap-anywhere">{signIn.purpose}</p>
                <p className="text-small text-fg-muted wrap-anywhere">{signIn.line}</p>
                {signIn.warning === undefined ? null : (
                  <Callout tone="attention">{signIn.warning}</Callout>
                )}
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    case "addresses": {
      const line = addressesLine(fence, code);
      return (
        <Disclosure summary={sectionRow(ADDRESSES_SECTION, addresses.length)}>
          {line === undefined ? null : <p className="text-small text-fg-muted">{line}</p>}
          <Items>
            {addresses.map((address) => (
              <li key={address.address} className="text-small wrap-anywhere">
                {address.where === undefined ? (
                  <code className="font-mono">{address.address}</code>
                ) : (
                  // R9: the row in `fg`, where the host may be in `fg-muted`.
                  <>
                    {address.address}
                    <span className="text-fg-muted"> · {address.where}</span>
                  </>
                )}
                {address.program ? <span className="text-fg-muted"> {THE_PROGRAM}</span> : null}
              </li>
            ))}
          </Items>
        </Disclosure>
      );
    }
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

/** What changed (design section 6): the rows, then what stayed as it was, closed. */
function Changes({
  summary,
  intro,
}: {
  readonly summary: PluginChangeSummary | undefined;
  /** The "off until you look" line: true for an edited file, false for an update, which isn't off. */
  readonly intro: boolean;
}) {
  if (summary === undefined || !summary.readable) {
    return <p className="text-body text-fg">{CHANGED_UNREADABLE}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {intro ? <p className="text-body text-fg">{CHANGED_INTRO}</p> : null}
      <ul className="flex list-none flex-col gap-2">
        {summary.rows.map((row, index) => (
          <ChangeLine key={index} row={row} />
        ))}
      </ul>
      {summary.unchanged.length === 0 ? null : (
        <Disclosure summary={unchangedRow(summary.unchanged.length)}>
          <Items>
            {summary.unchanged.map((line, index) => (
              <li key={index} className="text-small text-fg-muted wrap-anywhere">
                {line}
              </li>
            ))}
          </Items>
        </Disclosure>
      )}
    </div>
  );
}

/** A tag, what it is, and for a change the old value muted, an arrow, the new value in weight 500. */
function ChangeLine({ row }: { readonly row: ChangeRow }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2 text-small wrap-anywhere">
      <StatusChip tone="neutral">{row.tag}</StatusChip>
      <span>{row.what}</span>
      {row.from === undefined && row.to === undefined ? null : (
        <span>
          {row.from === undefined ? null : <span className="text-fg-muted">{row.from}</span>}
          {row.from !== undefined && row.to !== undefined ? ARROW : null}
          {row.to === undefined ? null : <span className="font-medium">{row.to}</span>}
        </span>
      )}
    </li>
  );
}

/** The kinds of secret the plugin has, backend first, each once. */
function secretKinds(secrets: readonly TrustSecret[]): SecretKind[] {
  return (["backend", "program"] as const).filter((kind) =>
    secrets.some((secret) => secret.kind === kind),
  );
}
