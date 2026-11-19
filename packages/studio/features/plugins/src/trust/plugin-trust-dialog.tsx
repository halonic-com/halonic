import {
  type PluginTrustFiles,
  type PluginTrustSection,
  pluginTrustContent,
  pluginTrustSections,
} from "@halonicjs/app";
import type { Plugin } from "@halonicjs/format";
import { markHiddenName } from "@halonicjs/std";
import { Dialog, Disclosure, StatusChip } from "@halonicjs/studio-kit";
import type { ReactNode } from "react";
import { originText, type PluginOrigin, RISK_WORDS } from "../page/page-text.ts";
import { Quoted } from "../ui/quoted.tsx";
import type { ChangeRow, PluginChangeSummary } from "./change-rows.ts";
import { type TrustCheckContent, type TrustSecret, trustCheckContent } from "./trust-check.ts";
import {
  ADDRESSES_SECTION,
  ARROW,
  AT,
  CAN_REACH,
  CHANGED_INTRO,
  CHANGED_UNREADABLE,
  FILES_HEADING,
  FOLDER_HEADING,
  FROM,
  GOES_ONLY_TO,
  HOW,
  IN_STUDIO_LINE,
  IN_STUDIO_SECTION,
  inStudioRow,
  keepButton,
  moreFilesRow,
  NOT_NOW,
  OUTSIDE_TEXT,
  PROGRAMS_SECTION,
  type ProgramsRun,
  RUNS,
  runsLine,
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
  unchangedRow,
  updateNotSavedLine,
  VERSION,
} from "./trust-text.ts";

/** The props of `PluginTrustDialog`. */
export interface PluginTrustDialogProps {
  readonly manifest: Plugin;
  /** Where it was added from; a plugin put in the folder by hand has none. */
  readonly origin: PluginOrigin | undefined;
  readonly reason: TrustCheckReason;
  /** The plugin folder's real path, shown under Folder; the line is left out when unsaid. */
  readonly folder?: string | undefined;
  /** The backend files the fingerprint covers, shown under Backend files. */
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
  readonly onTrust: () => void;
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
  const { manifest, reason } = props;
  const content = trustCheckContent(manifest);
  const summary = trustSummary(content.counts, props.programsRun);
  return (
    <Dialog
      title={trustTitle(reason, manifest.name, props.trustedOn, manifest.version)}
      size="md"
      closeButton={false}
      cancelLabel={props.update === undefined ? NOT_NOW : keepButton(props.update.keep)}
      footnote={TRUST_CHECK_LAST_LINE}
      confirm={{ label: trustButton(reason), busyLabel: TRUSTING }}
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
      onConfirm={props.onTrust}
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
            <Sections
              content={content}
              shown={shownSections(manifest)}
              name={manifest.name}
              programsRun={props.programsRun}
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

/**
 * Where the plugin sits and which files its fingerprint covers, as `halonic plugin add` shows
 * them. Both come from the workspace, so they are plain text in monospace that wraps at any
 * character, never cut short, with each hidden or direction-changing character written out as a
 * marker (`⟦U+202E⟧`): a person deciding to trust it should see exactly where it sits.
 */
function Location({
  folder,
  files,
}: {
  readonly folder: string | undefined;
  readonly files: PluginTrustFiles | undefined;
}) {
  const shown = files?.shown ?? [];
  return (
    <div className="flex flex-col gap-3">
      {folder === undefined ? null : (
        <Labelled label={FOLDER_HEADING} stacked>
          <code className="font-mono text-small wrap-anywhere">{markHiddenName(folder)}</code>
        </Labelled>
      )}
      {shown.length === 0 ? null : (
        <Labelled label={FILES_HEADING} stacked>
          <ul className="flex list-none flex-col gap-0.5">
            {shown.map((path) => (
              <li key={path}>
                <code className="font-mono text-small wrap-anywhere">{markHiddenName(path)}</code>
              </li>
            ))}
            {files === undefined || files.more === 0 ? null : (
              <li className="text-small text-fg-muted">{moreFilesRow(files.more)}</li>
            )}
          </ul>
        </Labelled>
      )}
    </div>
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
}: {
  readonly content: TrustCheckContent;
  readonly shown: readonly PluginTrustSection[];
  readonly name: string;
  readonly programsRun: ProgramsRun;
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
}: {
  readonly section: PluginTrustSection;
  readonly content: TrustCheckContent;
  readonly name: string;
  readonly programsRun: ProgramsRun;
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
        <Disclosure summary={sectionRow(PROGRAMS_SECTION, programs.length)}>
          <Items>
            {programs.map((program) => (
              <li key={program.id} className="flex flex-col gap-1">
                <code className="font-mono text-small wrap-anywhere">{program.command}</code>
                <Labelled label={RUNS}>{runsLine(programsRun)}</Labelled>
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
function Labelled({
  label,
  children,
  stacked = false,
}: {
  readonly label: string;
  readonly children: ReactNode;
  /** The value sits on lines under the label, as a list does. */
  readonly stacked?: boolean;
}) {
  if (stacked) {
    return (
      <div className="flex flex-col gap-1">
        <span className="text-small text-fg-muted">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <p className="text-small wrap-anywhere">
      <span className="text-fg-muted">{label} </span>
      {children}
    </p>
  );
}
