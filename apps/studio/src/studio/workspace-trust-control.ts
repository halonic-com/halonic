import { type RunnerUnfencedReason, runnerUnfencedWords } from "@halonicjs/app";
import type { InstalledPluginFeed } from "@halonicjs/studio-feature-plugins";
import {
  type PluginUnfencedRuns,
  trustStatusOf,
  UNFENCED_CHECKBOX,
  type UnfencedRunStatus,
  YES_NOT_SAVED,
  yesDeclined,
} from "@halonicjs/studio-feature-plugins/api";
import {
  TrustAsks,
  type TrustGrantResult,
  type TrustReview,
  type WorkspaceTrustControl,
} from "@halonicjs/studio-feature-workspace";
import { errorReasonFor } from "@halonicjs/studio-shell";
import { pluginHostsOf } from "../plugins/plugin-hosts.ts";
import { type IntegrationRuns, trustReviewOf } from "./trust-review.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/** What the trust view reads of the installed plugins: the plugins feature's feed. */
type PluginsRead = Pick<InstalledPluginFeed, "current" | "subscribe">;

/**
 * The window's view of one workspace's trust (`studio.workspace-trust-ui`): the badge to show
 * and the check to open, both from the last finished check of {@link WorkspaceTrust}, and the
 * way to save a person's trust in exactly what was shown. The check is built once per finished
 * check, so what the dialog shows is stable until the workspace changes or the host answers
 * whether integration code runs in the sandbox here, which it asks each time the check opens. A
 * plugin connector's Reaches line comes from the installed plugins (`plugins`), so the check is
 * built again, and its listeners told, when they are read again.
 * Where integration code doesn't run in the sandbox, the check asks for the person's yes, which
 * **Trust** saves first.
 *
 * @example
 * const control = new WorkspaceTrustView(trust, "/work/acme");
 * control.badge; // "not-trusted" until a person trusts what the folder holds
 */
export class WorkspaceTrustView implements WorkspaceTrustControl {
  readonly #trust: WorkspaceTrust;
  readonly #folder: string;
  readonly #plugins: () => PluginsRead | undefined;
  /** The starts that ask for the check after a refusal: Run now, the Run panel and Run again. */
  readonly asks = new TrustAsks();
  readonly #unfencedRuns: PluginUnfencedRuns | undefined;
  readonly #listeners = new Set<() => void>();
  #runs: IntegrationRuns;
  #reads = 0;
  #builtFor: unknown;
  #builtWith: IntegrationRuns;
  #builtForPlugins: unknown;
  #builtForMarks: unknown;
  #built: TrustReview | undefined;

  /**
   * @param unfencedRuns - the agent host's word on whether integration code runs in the sandbox,
   *   and the way to save the yes to run it without: the window's one object, which the plugin
   *   check and Settings use too; left out, the check doesn't say how integrations run
   * @param plugins - the installed plugins, once and where the window has them
   */
  constructor(
    trust: WorkspaceTrust,
    folder: string,
    unfencedRuns?: PluginUnfencedRuns,
    plugins: () => PluginsRead | undefined = () => undefined,
  ) {
    this.#trust = trust;
    this.#folder = folder;
    this.#unfencedRuns = unfencedRuns;
    this.#plugins = plugins;
  }

  /**
   * Asks the host again whether integration code runs in the sandbox: the Runs row says it's
   * checking until it answers, and leaves the row out when it can't. An answer to an older ask is
   * dropped. Only a workspace with local integrations asks.
   */
  checkRuns(): void {
    const unfencedRuns = this.#unfencedRuns;
    if (unfencedRuns === undefined || (this.#integrations() ?? 0) === 0) return;
    this.#reads += 1;
    const read = this.#reads;
    this.#setRuns({ state: "checking" });
    unfencedRuns.status().then(
      (answer) => {
        if (this.#reads === read) this.#setRuns(integrationRunsOf(answer));
      },
      () => {
        if (this.#reads === read) this.#setRuns(undefined);
      },
    );
  }

  #setRuns(runs: IntegrationRuns): void {
    this.#runs = runs;
    for (const listener of [...this.#listeners]) listener();
  }

  /** How many local integrations the check lists, or `undefined` without one to show. */
  #integrations(): number | undefined {
    const check = this.#trust.check;
    if (check === undefined || check.status === "trusted" || check.status === "refused") {
      return undefined;
    }
    if (check.status === "changed") {
      return check.changes.integrations.added.length + check.changes.integrations.changed.length;
    }
    return check.content.integrations?.length ?? 0;
  }

  get badge(): WorkspaceTrustControl["badge"] {
    const check = this.#trust.check;
    if (check === undefined) return this.#trust.failure === undefined ? "none" : "failed";
    if (check.status === "trusted") return "none";
    if (this.needsNoTrust) return "none";
    if (check.status === "changed") return "changed";
    return check.status === "unreadable" ? "list-unreadable" : "not-trusted";
  }

  get needsNoTrust(): boolean {
    return this.#trust.needsNoTrust;
  }

  get status(): WorkspaceTrustControl["status"] {
    const status = this.#trust.check?.status;
    if (status === undefined) return this.#trust.failure === undefined ? "unknown" : "failed";
    if (status === "trusted" || status === "changed") return status;
    return status === "unreadable" ? "list-unreadable" : "not-trusted";
  }

  get trustedAt(): string | undefined {
    const check = this.#trust.check;
    return check?.status === "trusted" || check?.status === "changed" ? check.trustedAt : undefined;
  }

  get failure(): string | undefined {
    return this.#trust.failure;
  }

  retry(): Promise<void> {
    return this.#trust.refresh();
  }

  review(): TrustReview | undefined {
    const check = this.#trust.check;
    const plugins = this.#plugins()?.current();
    const pluginsChanged = plugins !== this.#builtForPlugins;
    const marks = this.#trust.assistantAdded;
    const marksChanged = marks !== this.#builtForMarks;
    if (
      check !== this.#builtFor ||
      this.#runs !== this.#builtWith ||
      pluginsChanged ||
      marksChanged
    ) {
      this.#builtFor = check;
      this.#builtWith = this.#runs;
      this.#builtForPlugins = plugins;
      this.#builtForMarks = marks;
      this.#built =
        check === undefined || this.needsNoTrust ? undefined : this.#reviewOf(check, plugins);
    }
    return this.#built;
  }

  #reviewOf(
    check: NonNullable<WorkspaceTrust["check"]>,
    plugins: ReturnType<PluginsRead["current"]> | undefined,
  ): TrustReview | undefined {
    const review = trustReviewOf(check, {
      name: this.#trust.name ?? this.#folder,
      folder: this.#folder,
      runs: this.#runs,
      assistantAdded: this.#trust.assistantAdded,
      ...(plugins === undefined ? {} : { pluginHosts: pluginHostsOf(plugins) }),
    });
    const asking = this.#asking();
    return review === undefined || asking === undefined
      ? review
      : {
          ...review,
          unfencedYes: {
            reason: asking,
            checkbox: UNFENCED_CHECKBOX,
            reasonLine: runnerUnfencedWords(asking, "integration").reason,
          },
        };
  }

  /** The reason to ask the yes for: the check lists integrations, and none is saved for it. */
  #asking(): RunnerUnfencedReason | undefined {
    const runs = this.#runs;
    if (runs?.state !== "not-fenced" || runs.allowedOn !== undefined) return undefined;
    return (this.#integrations() ?? 0) > 0 ? runs.reason : undefined;
  }

  async grant(fingerprint: string, allowUnfenced = false): Promise<TrustGrantResult> {
    const asking = this.#asking();
    if (allowUnfenced && asking !== undefined && this.#unfencedRuns !== undefined) {
      const saved = await this.#allow(this.#unfencedRuns, asking);
      if (saved !== undefined) return saved;
    }
    return this.#trust.grant(fingerprint);
  }

  /**
   * Saves the yes, the same way the plugin check does (design section 7): when the reason changed
   * in between, nothing is saved, and the check reads the status again; when the person cancels
   * the shell's own window, nothing is saved either. Answers `undefined` once the yes is saved,
   * else why trust wasn't.
   */
  async #allow(
    unfencedRuns: PluginUnfencedRuns,
    reason: RunnerUnfencedReason,
  ): Promise<TrustGrantResult | undefined> {
    try {
      const yes = await unfencedRuns.allow(reason);
      if (yes !== null) {
        // Shows the yes just saved; an older status answer is dropped.
        this.#reads += 1;
        this.#setRuns(integrationRunsOf({ run: "allowed", ...yes }));
        return undefined;
      }
      this.checkRuns();
      return { ok: false, reason: "the sandbox status changed", checkAgain: true };
    } catch (error) {
      // The person pressed Cancel in the shell's own window: nothing to say (HAL-17065).
      if (yesDeclined(error))
        return { ok: false, reason: errorReasonFor(error), error, cancelled: true };
      if (kindOf(error) === "allow_failed") return { ok: false, reason: YES_NOT_SAVED, error };
      // A host refusal's raw message names the agent host, a route and a code (C665-53).
      return { ok: false, reason: errorReasonFor(error), error };
    }
  }

  remove(): Promise<TrustGrantResult> {
    return this.#trust.remove();
  }

  subscribe(listener: () => void): () => void {
    // A fresh function per subscription, so one listener given twice is kept twice.
    const own = () => listener();
    this.#listeners.add(own);
    const stopTrust = this.#trust.subscribe(listener);
    const stopPlugins = this.#plugins()?.subscribe(listener);
    return () => {
      this.#listeners.delete(own);
      stopTrust();
      stopPlugins?.();
    };
  }
}

/**
 * The Runs row's state for the host's answer, read as the plugin check reads it (`trustStatusOf`):
 * `allowed` is not in the sandbox with the day of the saved yes, which the command line honours
 * too (`cli.local-integration-unfenced-yes`). A reason Studio has no words for, a yes with no
 * readable day, and `stopped`, which isn't a trust-check state, leave the row out.
 */
export function integrationRunsOf(status: UnfencedRunStatus, now = new Date()): IntegrationRuns {
  const { fence, yes } = trustStatusOf(status, now);
  if (fence?.state === "fenced") return { state: "fenced" };
  if (fence?.state !== "not-fenced") return undefined;
  return { state: "not-fenced", reason: fence.reason, allowedOn: yes?.on };
}

/** A host refusal's `kind` (the agent host client's `AgentHostError`), if it has one. */
function kindOf(error: unknown): unknown {
  return typeof error === "object" && error !== null && "kind" in error ? error.kind : undefined;
}
