/** A request as the server received it, for the host's check of Halonic Cloud's signature. */
export interface CloudSignedRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: Headers;
  /** The body's exact bytes; empty for a request without a body. */
  readonly body: Uint8Array;
}

/** What a request Halonic Cloud signed was signed for. */
export interface VerifiedCloudRequest {
  /** The signed `halonic-end-user`, when the request names one. */
  readonly endUser: string | undefined;
  /** The signed `halonic-command-id`, when the request carries one. */
  readonly commandId: string | undefined;
}

/**
 * The host's check that Halonic Cloud signed a request: the `cloud-to-deployment` direction, one
 * of Cloud's pinned `command` keys, the deployment's own product from its configuration (never one
 * from the request), the time window, and a nonce it records before answering, so the same
 * request is never accepted twice. A host package can't use the signed-request package, so the
 * target builds this check and passes it in.
 *
 * @returns what the request was signed for, or `null` for every refusal alike
 */
export type VerifyCloudRequest = (
  request: CloudSignedRequest,
) => Promise<VerifiedCloudRequest | null>;

/** One command Cloud sent, as its body carries it. */
export interface CloudCommand {
  /** The command's id, the same as the signed `halonic-command-id`. */
  readonly id: string;
  readonly kind: string;
  /** A number for a product-state command, `null` for every other kind. */
  readonly sequence: number | null;
  readonly payload: Readonly<Record<string, unknown>>;
}

/** Where a command's work got to: finished, or still going and to be finished by a later try. */
export type CloudCommandProgress = "done" | "pending";

/**
 * A command's work, ready to run. It must be safe to run twice: a try whose lease ran out is
 * taken over by the next one, which runs the work again from the start.
 */
export type CloudCommandWork = () => Promise<CloudCommandProgress>;

/** What carries out one kind of command. */
export interface CloudCommandHandler {
  /** The `kind` it carries out, such as `sessions.revoke`. */
  readonly kind: string;
  /** How long a try holds the command before a later try may take it over, in milliseconds. */
  readonly leaseMs: number;
  /** The work for a command of this kind, or `null` when its payload or sequence isn't valid. */
  prepare(command: CloudCommand): CloudCommandWork | null;
}

/** What {@link CloudCommandLedger.claim} found for a command id. */
export type CloudCommandClaim = "claimed" | "running" | "done";

/**
 * Which command ids are finished and which a try is running, so a command is carried out once
 * even when Cloud's tries overlap. Each call is one atomic step.
 */
export interface CloudCommandLedger {
  /**
   * Claims a command for one try: `claimed` when the id is new or the try holding it let its lease
   * run out (the claim then passes to this try), `running` while another try's lease holds, and
   * `done` once a try finished it.
   *
   * @param claim - this try's own token; only a call with the same token finishes or releases it
   */
  claim(commandId: string, claim: string, now: Date, leaseUntil: Date): Promise<CloudCommandClaim>;
  /** Marks the command finished, when this try still holds it. */
  finish(commandId: string, claim: string): Promise<void>;
  /** Lets the command go after a failed try, when this try still holds it, so the next try runs it. */
  release(commandId: string, claim: string): Promise<void>;
}

/** The product's state in Halonic Cloud. */
export type CloudLinkState = "draft" | "live" | "paused";

/** The product state the deployment keeps from Cloud's latest `product.state` command. */
export interface CloudLink {
  readonly state: CloudLinkState;
  /** Cloud's number for the change; a larger number is a later change. */
  readonly sequence: number;
  /** When the state changed in Cloud, as an ISO time. */
  readonly changedAt: string;
}

/** Where the deployment keeps its one {@link CloudLink}. */
export interface CloudLinkStore {
  /** The kept link, or `null` before Cloud's first `product.state` command. */
  read(): Promise<CloudLink | null>;
  /** Keeps `link`, unless the kept one has the same sequence or a larger one, in one atomic step. */
  write(link: CloudLink): Promise<"applied" | "stale">;
}

/** What the routes for Halonic Cloud's commands need. A deployment Cloud doesn't sell has none. */
export interface CloudInboxPorts {
  readonly verify: VerifyCloudRequest;
  readonly commands: CloudCommandLedger;
  readonly link: CloudLinkStore;
  /** The handlers of every kind but `product.state`, which the server carries out itself; each kind once. */
  readonly handlers: readonly CloudCommandHandler[];
}
