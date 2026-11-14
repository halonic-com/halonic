import type {
  TrustGrantResult,
  TrustReview,
  WorkspaceTrustControl,
} from "@halonicjs/studio-feature-workspace";
import { trustReviewOf } from "./trust-review.ts";
import type { WorkspaceTrust } from "./workspace-trust.ts";

/**
 * The window's view of one workspace's trust (`studio.workspace-trust-ui`): the badge to show
 * and the check to open, both from the last finished check of {@link WorkspaceTrust}, and the
 * way to save a person's trust in exactly what was shown. The check is built once per finished
 * check, so what the dialog shows is stable until the workspace changes.
 *
 * @example
 * const control = new WorkspaceTrustView(trust, "/work/acme");
 * control.badge; // "not-trusted" until a person trusts what the folder holds
 */
export class WorkspaceTrustView implements WorkspaceTrustControl {
  readonly #trust: WorkspaceTrust;
  readonly #folder: string;
  #builtFor: unknown;
  #built: TrustReview | undefined;

  constructor(trust: WorkspaceTrust, folder: string) {
    this.#trust = trust;
    this.#folder = folder;
  }

  get badge(): WorkspaceTrustControl["badge"] {
    const check = this.#trust.check;
    if (check === undefined) return this.#trust.failure === undefined ? "none" : "failed";
    if (check.status === "trusted") return "none";
    if (check.status === "changed") return "changed";
    return check.status === "unreadable" ? "list-unreadable" : "not-trusted";
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
    if (check !== this.#builtFor) {
      this.#builtFor = check;
      this.#built =
        check === undefined
          ? undefined
          : trustReviewOf(check, {
              name: this.#trust.name ?? this.#folder,
              folder: this.#folder,
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
    return this.#trust.subscribe(listener);
  }
}
