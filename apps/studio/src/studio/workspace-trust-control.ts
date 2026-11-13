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

  get badge(): "none" | "not-trusted" | "list-unreadable" {
    const check = this.#trust.check;
    if (check === undefined || check.status === "trusted") return "none";
    return check.status === "unreadable" ? "list-unreadable" : "not-trusted";
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

  subscribe(listener: () => void): () => void {
    return this.#trust.subscribe(listener);
  }
}
