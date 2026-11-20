/**
 * The messages of the engine role's control pipe (B1, design note D2 and D4):
 * Studio's shell and `halonic-agent-host --engine` talk over the engine's own
 * standard input and output, and nothing else. The pipe is private to the two
 * processes, so no other program and no other account can open it, and the
 * engine stops when its standard input closes.
 *
 * Each message is one frame:
 *
 *   [length: u32 big-endian][UTF-8 JSON object]
 *
 * The length counts the JSON bytes only and is never 0. The object's `kind`
 * names the message; the shell parses the closed set of {@link EngineMessage}
 * kinds strictly (unknown fields refused) and treats the engine as untrusted.
 * Any fault ends the engine: a length over the cap or of 0, bad UTF-8, bad
 * JSON, an unknown kind or field, an unknown or repeated request id, or any
 * frame before `handshake`. The shell then closes standard input, kills the
 * engine and counts it as a crash. Neither side ever logs a frame's content,
 * which may hold a secret.
 *
 * The engine writes frames with a private writer: `console.*` and every other
 * write to standard output go to standard error once the engine starts.
 *
 * The Rust side mirrors these types in the shell; a change here changes both.
 */

/** The version of this protocol. The shell refuses a handshake with any other. */
export const controlProtocolVersion = 1;

/** The most JSON bytes in a frame the engine sends. */
export const maxEngineFrameBytes = 64 * 1024;

/**
 * The most JSON bytes in a frame the shell sends: a secret's value can be up
 * to 16 KiB (the shell's `MAX_VALUE_BYTES`), and JSON escapes a byte in at
 * most 6, so 128 KiB holds the largest value with the rest of the answer.
 */
export const maxShellFrameBytes = 128 * 1024;

/** The length prefix in front of each frame's JSON. */
export const frameLengthBytes = 4;

/**
 * The most broker requests (`secret_get`, `token_get`, `origins_get`) the
 * engine may have unanswered at once, counting keychain calls that are still
 * stuck after their answer timed out (the broker's `MAX_OUTSTANDING`). The
 * shell refuses any above it with `busy`.
 */
export const maxOpenBrokerRequests = 16;

/**
 * Names one broker request, so its answer finds it. The engine numbers its
 * requests 1, 2, 3 … and never reuses a number in one launch; the shell treats
 * an id it already answered, or a lower one, as a fault.
 */
export type RequestId = number;

// ---- From the engine to the shell ------------------------------------------

/**
 * The engine's first frame, once it holds `engine.lock` and serves: where its
 * HTTP API listens and its token for this launch. The shell checks, as for the
 * agent host's handshake, that the address is `http://127.0.0.1:<port>` and the
 * token 43 characters of base64url, keeps the token in Rust and sends it only
 * to that address.
 */
export interface HandshakeMessage {
  readonly kind: "handshake";
  readonly protocol: typeof controlProtocolVersion;
  readonly url: string;
  readonly token: string;
}

/**
 * Asks for a workspace secret by name. The shell refuses Halonic's own names
 * by rule (`token_key`, `serve_password`, everything `SecretName::is_halonic`
 * covers, `plugin__*`) with `reserved_name`, and answers only while the
 * engine's workspace is trusted on this computer.
 */
export interface SecretGetMessage {
  readonly kind: "secret_get";
  readonly id: RequestId;
  readonly name: string;
}

/** Asks for a connector's OAuth token, through the shell's token store: `name` without the `halonic_token_` prefix. */
export interface TokenGetMessage {
  readonly kind: "token_get";
  readonly id: RequestId;
  readonly name: string;
}

/** Asks for the origins a key may be sent to (HAL-11887). Read only: the engine can't change them. */
export interface OriginsGetMessage {
  readonly kind: "origins_get";
  readonly id: RequestId;
  readonly name: string;
}

/**
 * How the engine is doing: after the handshake, whenever a field changes, and
 * at least every 30 seconds. The shell drops any beyond one a second.
 */
export interface HealthMessage {
  readonly kind: "health";
  /** Whether the routine scheduler ticks; `false` once a stop began. */
  readonly scheduling: boolean;
  /** The runs that are going now (running or waiting). */
  readonly activeRuns: number;
  /** When the scheduler last ticked, as an ISO time, or `null` before its first tick. */
  readonly lastTick: string | null;
}

/**
 * The engine's last frame after a `stop`: the scheduler stopped, the steps
 * that ended within the grace time ended, the rest are recorded as
 * interrupted, and `engine.lock` is released. The engine exits after it.
 */
export interface StoppedMessage {
  readonly kind: "stopped";
  /** The runs recorded as interrupted because their steps didn't end in time. */
  readonly interrupted: number;
}

/** Every frame the engine may send: the closed set the shell accepts. */
export type EngineMessage =
  | HandshakeMessage
  | SecretGetMessage
  | TokenGetMessage
  | OriginsGetMessage
  | HealthMessage
  | StoppedMessage;

// ---- From the shell to the engine ------------------------------------------

/**
 * Where the sandbox host is, for harness steps and the bridge (D8): its
 * address on this computer's loopback (the relay's on Windows with WSL) and its
 * launch token. `null` while no sandbox host runs. Sent after the handshake
 * and again each time the sandbox host starts or stops; the newest one counts.
 */
export interface SandboxHostMessage {
  readonly kind: "sandbox_host";
  readonly connection: { readonly url: string; readonly token: string } | null;
}

/**
 * Stop now (Quit, an update): stop the scheduler, give running steps
 * {@link stopGraceMs} to end, record the rest as interrupted, release
 * `engine.lock`, send `stopped` and exit. The shell kills the engine if it
 * hasn't exited 15 seconds after this.
 */
export interface StopMessage {
  readonly kind: "stop";
}

/** How long the engine lets running steps end after `stop`. */
export const stopGraceMs = 10_000;

/**
 * The broker's answer to `secret_get` or `token_get`: the value, or `null`
 * when nothing is stored under the name.
 */
export interface ValueAnswer {
  readonly result: "value";
  readonly value: string | null;
}

/** The broker's answer to `origins_get`: the key's allowed origins, or `null` when none are recorded. */
export interface OriginsAnswer {
  readonly result: "origins";
  readonly origins: readonly string[] | null;
}

/**
 * Why the broker gave no answer. The engine's `Secrets` adapter acts on each:
 * `invalid_name` and `reserved_name` count as "not found" for that name;
 * `untrusted` refuses the run as an untrusted workspace does; `busy`,
 * `unavailable` and `denied` fail the step with "secrets unavailable";
 * `unreadable` and `failed` fail the step.
 */
export type RefusalReason =
  /** The name breaks the secret name rule. */
  | "invalid_name"
  /** Halonic's own name or a plugin's, such as the token store's key: the engine never gets it. */
  | "reserved_name"
  /** The engine's workspace has no trust record on this computer now. */
  | "untrusted"
  /** The engine has {@link maxOpenBrokerRequests} requests open already. */
  | "busy"
  /** No keychain, or it didn't answer in about 30 seconds (it may be locked). */
  | "unavailable"
  /** The user or the system refused access to the keychain. */
  | "denied"
  /** The stored value can no longer be read. */
  | "unreadable"
  /** Any other keychain failure. */
  | "failed";

/** The broker's refusal of a request. */
export interface RefusedAnswer {
  readonly result: "refused";
  readonly reason: RefusalReason;
}

/**
 * The secret broker's answer, as the shell's `halonic-secret-broker` crate
 * serializes its `BrokerAnswer`: the body of a {@link SecretAnswerMessage}.
 */
export type BrokerAnswer = ValueAnswer | OriginsAnswer | RefusedAnswer;

/**
 * The shell's one answer to a broker request: the request's id with the
 * broker's answer beside it, e.g.
 * `{ "kind": "secret_answer", "id": 3, "result": "value", "value": null }`.
 * A `value` answer to `origins_get`, or an `origins` answer to the others, is
 * a fault.
 */
export type SecretAnswerMessage = {
  readonly kind: "secret_answer";
  readonly id: RequestId;
} & BrokerAnswer;

/** Every frame the shell may send. The engine stops on any other. */
export type ShellMessage = SandboxHostMessage | StopMessage | SecretAnswerMessage;
