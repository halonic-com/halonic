import { isRunnerUnfencedReason } from "@halonicjs/app";
import type { InstalledPluginFeed } from "@halonicjs/studio-feature-plugins";
import type { UnfencedRunStatus } from "@halonicjs/studio-feature-plugins/api";
import {
  TrustAsks,
  type TrustGrantResult,
  type TrustReview,
  type WorkspaceTrustControl,
} from "@halonicjs/studio-feature-workspace";
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
  readonly #runsStatus: (() => Promise<UnfencedRunStatus>) | undefined;
  readonly #listeners = new Set<() => void>();
  #runs: IntegrationRuns;
  #reads = 0;
  #builtFor: unknown;
  #builtWith: IntegrationRuns;
  #builtForPlugins: unknown;
  #built: TrustReview | undefined;

  /**
   * @param runsStatus - the agent host's word on whether integration code runs in the sandbox,
   *   the same as the plugin check reads; left out, the check doesn't say how integrations run
   * @param plugins - the installed plugins, once and where the window has them
   */
  constructor(
    trust: WorkspaceTrust,
    folder: string,
    runsStatus?: () => Promise<UnfencedRunStatus>,
    plugins: () => PluginsRead | undefined = () => undefined,
  ) {
    this.#trust = trust;
    this.#folder = folder;
    this.#runsStatus = runsStatus;
    this.#plugins = plugins;
  }

  /**
   * Asks the host again whether integration code runs in the sandbox: the Runs row says it's
   * checking until it answers, and leaves the row out when it can't. An answer to an older ask is
   * dropped. Only a workspace with local integrations asks.
   */
  checkRuns(): void {
    const status = this.#runsStatus;
    if (status === undefined || (this.#integrations() ?? 0) === 0) return;
    this.#reads += 1;
    const read = this.#reads;
    this.#setRuns({ state: "checking" });
    status().then(
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
    if (check !== this.#builtFor || this.#runs !== this.#builtWith || pluginsChanged) {
      this.#builtFor = check;
      this.#builtWith = this.#runs;
      this.#builtForPlugins = plugins;
      this.#built =
        check === undefined || this.needsNoTrust
          ? undefined
          : trustReviewOf(check, {
              name: this.#trust.name ?? this.#folder,
              folder: this.#folder,
              runs: this.#runs,
              ...(plugins === undefined ? {} : { pluginHosts: pluginHostsOf(plugins) }),
            });
    }
    return this.#built;
  }

  grant(fingerprint: string): Promise<TrustGrantResult> {
    return this.#trust.grant(fingerprint);
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
 * The Runs row's state for the host's answer. A saved yes doesn't make an integration start
 * (the CLI ignores it, HAL-12639), so `allowed` reads as `needs-yes`: it doesn't start. A reason
 * Studio has no words for, and `stopped`, which isn't a trust-check state, leave the row out.
 */
export function integrationRunsOf(status: UnfencedRunStatus): IntegrationRuns {
  switch (status.run) {
    case "fenced":
      return { state: "fenced" };
    case "allowed":
    case "needs-yes":
      return isRunnerUnfencedReason(status.reason)
        ? { state: "not-fenced", reason: status.reason }
        : undefined;
    case "stopped":
      return undefined;
  }
}
