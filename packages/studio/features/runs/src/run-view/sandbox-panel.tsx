import type { SandboxOpenedView, SandboxSignIn } from "@halonicjs/events";
import { escapeHidden } from "@halonicjs/std";
import type { ReactNode } from "react";
import { useState } from "react";
import { SiteNameText } from "./blocked-sites-text.tsx";
import { fillWords } from "./fill-words.tsx";
import { timeLimitParts } from "./sandbox-model.ts";
import {
  groupKey,
  readsShown,
  type SandboxKey,
  sandboxWords,
  sitesShown,
} from "./sandbox-words.ts";

/** The words of `key`, with each `{name}` filled in. */
export function say(key: SandboxKey, values: Readonly<Record<string, ReactNode>> = {}) {
  return fillWords(sandboxWords, key, values);
}

/** The words of `key` as plain text, for words whose values are all text. */
export function sayText(key: SandboxKey, values: Readonly<Record<string, string | number>> = {}) {
  return say(key, values).join("");
}

/**
 * The one line under a sandboxed step (sandbox-screens 1.2), in this order and only the parts
 * that apply: "In a sandbox · writes only in its working folder and its own temp and settings folders · reaches only Halonic". The link
 * "What it can do" is the row that carries this line, so it isn't part of the text.
 *
 * @example
 * sandboxLineText({ strength: "os", allowedSites: ["a.example"], … });
 * // "In a sandbox · writes only in its working folder and its own temp and settings folders · reaches Halonic and 1 site"
 */
export function sandboxLineText(view: SandboxOpenedView): string {
  const reaches = reachesText(view.allowedSites.length);
  return [
    sayText(view.strength === "vm" ? "sandbox.line.vm" : "sandbox.line.sandbox"),
    sayText("sandbox.line.writes"),
    reaches,
  ].join(" · ");
}

function reachesText(sites: number): string {
  if (sites === 0) return sayText("sandbox.line.reaches.halonic");
  if (sites === 1) return sayText("sandbox.line.reaches.one");
  return sayText("sandbox.line.reaches.many", { count: sites });
}

/** "30 minutes", "1 hour 30 minutes": the time limit in words. */
export function timeLimitText(ms: number): string {
  return timeLimitParts(ms)
    .map(({ unit, count }) =>
      sayText(`sandbox.time.${unit}.${count === 1 ? "one" : "many"}`, { count }),
    )
    .join(" ");
}

/** The props of {@link SandboxPanel}. */
export interface SandboxPanelProps {
  /** What the step's `sandbox.opened` event recorded. */
  readonly view: SandboxOpenedView;
  /** The agent's name as the person sees it: "Writer". */
  readonly agent: string;
  /** Whether the run is still going: the heading says "can" while it is, "could" once it ended. */
  readonly live: boolean;
  /** On a phone the action is a line naming where to change it, with no link, and "your computer". */
  readonly place: "desktop" | "phone";
  /** Opens the agent at Configuration › Harness. Desktop only; without it a desktop panel has no action. */
  readonly onOpenHarness?: () => void;
}

/**
 * What a sandboxed step could do (sandbox-screens 1.3): a heading, side-label rows (a row with
 * nothing in it is left out), the kind of sandbox, what it doesn't cover, and one action.
 *
 * It shows only what the event holds. A denied path group is a name, never its paths, and the
 * event never held the step's environment, so none can show here (Julian, HAL-1673).
 */
export function SandboxPanel({ view, agent, live, place, onOpenHarness }: SandboxPanelProps) {
  const folder = escapeHidden(view.workingFolder);
  return (
    <section className="flex flex-col gap-2 rounded-sm bg-surface-subtle p-3">
      <h3 className="text-body-strong">
        {sayText(live ? "sandbox.panel.title.live" : "sandbox.panel.title.ended")}
      </h3>
      <dl
        className={`grid gap-x-3 gap-y-2 text-small ${place === "phone" ? "grid-cols-1" : "grid-cols-[7rem_minmax(0,1fr)]"}`}
      >
        <Row label={sayText("sandbox.panel.writes")}>
          <Path>{folder}</Path>
          <p className="text-fg-muted">{sayText("sandbox.panel.writes.temp")}</p>
        </Row>
        <ReadsRow paths={view.readOnlyPaths} />
        <DeniedRow groups={view.deniedGroups} added={view.deniedPaths} />
        <ReachesRow sites={view.allowedSites} />
        <Row label={sayText("sandbox.panel.time")}>
          {sayText("sandbox.panel.time.value", { time: timeLimitText(view.timeLimitMs) })}
        </Row>
        {view.signIn === undefined ? null : (
          <Row label={sayText("sandbox.panel.sign-in")}>
            {signInText(view.signIn, agent, place)}
          </Row>
        )}
      </dl>
      <p className="text-small text-fg-muted">{kindText(view.strength, place)}</p>
      <p className="text-small text-fg-muted">
        {sayText("sandbox.panel.not-covered", { agent, folder })}
      </p>
      <Action agent={agent} place={place} onOpenHarness={onOpenHarness} />
    </section>
  );
}

/**
 * The Your sign-in sentence (mc 23.1): with a key, that the agent never sees it; with a
 * subscription, where it is saved. A key from another provider file is named by its id.
 *
 * @example
 * signInText({ kind: "subscription", provider: "openai" }, "Writer", "desktop");
 * // "With a ChatGPT subscription: saved in Writer's own settings folder on this computer. …"
 */
export function signInText(
  signIn: SandboxSignIn,
  agent: string,
  place: "desktop" | "phone",
): string {
  if (signIn.kind === "subscription") {
    const plan = sayText(`sandbox.sign-in.plan.${signIn.provider}`);
    return sayText(`sandbox.panel.sign-in.subscription.${place}`, { plan, agent });
  }
  const provider =
    signIn.provider === "anthropic" || signIn.provider === "openai"
      ? sayText(`sandbox.sign-in.provider.${signIn.provider}`)
      : escapeHidden(signIn.provider);
  return sayText("sandbox.panel.sign-in.key", { agent, provider });
}

function kindText(strength: SandboxOpenedView["strength"], place: "desktop" | "phone") {
  return strength === "remote"
    ? sayText("sandbox.panel.kind.remote")
    : sayText(`sandbox.panel.kind.${strength}.${place}`);
}

/** A side-label row: the label above its value on a phone, beside it on the desktop. */
function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </>
  );
}

/** A path in mono, wrapping rather than overflowing. */
function Path({ children }: { readonly children: string }) {
  return <span className="font-mono wrap-anywhere">{children}</span>;
}

/** Can't change: the first {@link readsShown} paths, then "and 2 more", which opens the rest in place. */
function ReadsRow({ paths }: { readonly paths: readonly string[] }) {
  const [all, setAll] = useState(false);
  if (paths.length === 0) return null;
  const shown = all ? paths : paths.slice(0, readsShown);
  const more = paths.length - shown.length;
  return (
    <Row label={sayText("sandbox.panel.reads")}>
      <ul>
        {shown.map((path) => (
          <li key={path}>
            <Path>{escapeHidden(path)}</Path>
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <button
          type="button"
          className="rounded-xs text-fg-muted underline focus-ring"
          onClick={() => setAll(true)}
        >
          {sayText("sandbox.panel.reads.more", { count: more })}
        </button>
      ) : null}
    </Row>
  );
}

/** Can't open: the groups by name, never their paths, then the paths the person added. */
function DeniedRow({
  groups,
  added,
}: {
  readonly groups: SandboxOpenedView["deniedGroups"];
  readonly added: readonly string[];
}) {
  if (groups.length === 0 && added.length === 0) return null;
  return (
    <Row label={sayText("sandbox.panel.denied")}>
      {groups.length === 0 ? null : (
        <p>{groups.map((code) => sayText(groupKey(code))).join(" · ")}</p>
      )}
      {added.length === 0 ? null : (
        <p className="text-fg-muted">
          {say("sandbox.panel.denied.added", {
            paths: added.map((path, index) => (
              <span key={path}>
                {index === 0 ? "" : ", "}
                <Path>{escapeHidden(path)}</Path>
              </span>
            )),
          })}
        </p>
      )}
    </Row>
  );
}

/** Reaches: always Halonic first, then up to {@link sitesShown} sites as plain text, then "and 3 more". */
function ReachesRow({ sites }: { readonly sites: readonly string[] }) {
  const more = sites.length - sitesShown;
  return (
    <Row label={sayText("sandbox.panel.reaches")}>
      {sayText("sandbox.panel.reaches.halonic")}
      {sites.slice(0, sitesShown).map((host) => (
        <span key={host}>
          {", "}
          <SiteNameText host={host} />
        </span>
      ))}
      {more > 0 ? (
        <span className="text-fg-muted">
          {" "}
          {sayText("sandbox.panel.reaches.more", { count: more })}
        </span>
      ) : null}
    </Row>
  );
}

function Action({
  agent,
  place,
  onOpenHarness,
}: Pick<SandboxPanelProps, "agent" | "place"> & {
  readonly onOpenHarness: (() => void) | undefined;
}) {
  if (place === "phone") {
    return (
      <p className="text-small text-fg-muted">{sayText("sandbox.panel.phone-fix", { agent })}</p>
    );
  }
  if (onOpenHarness === undefined) return null;
  return (
    <button
      type="button"
      onClick={onOpenHarness}
      className="self-start rounded-xs text-small text-accent underline focus-ring"
    >
      {sayText("sandbox.panel.action", { agent })}
    </button>
  );
}

/** The props of {@link SandboxOffPanel}. */
export interface SandboxOffPanelProps {
  readonly agent: string;
  /** On a phone the sentences say "your computer", not "this computer". */
  readonly place: "desktop" | "phone";
}

/** What a step that ran without the sandbox says: the Full access chip and why it had no limits. */
export function SandboxOffPanel({ agent, place }: SandboxOffPanelProps) {
  return (
    <section className="flex flex-col gap-2 rounded-sm bg-surface-subtle p-3">
      <h3 className="inline-flex items-center gap-1.5 text-body-strong">
        <span className="rounded-full bg-warning-soft px-2 text-small text-warning">
          {sayText("sandbox.off.chip")}
        </span>
        <span className="sr-only">{sayText(`sandbox.line.off.${place}`)}</span>
      </h3>
      <p className="text-small text-fg-muted">{sayText(`sandbox.off.body.${place}`, { agent })}</p>
    </section>
  );
}
