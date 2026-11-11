import {
  type Sandbox,
  type SandboxBlock,
  type SandboxBlockListener,
  type SandboxCapabilities,
  type SandboxCheck,
  type SandboxCommand,
  type SandboxFence,
  type SandboxProcess,
  type SandboxProfile,
  type SandboxSession,
  sandboxUnavailableReasons,
} from "@halonicjs/ports";
import { parse, type Schema, s } from "@halonicjs/schema-kit";
import { Emitter } from "@halonicjs/std";
import { type AgentHostTransport, answerError, readAnswer } from "./transport.ts";

const capabilitiesSchema = s
  .object({
    files: s.enum(["shared", "copied"]),
    strength: s.enum(["os", "vm", "remote", "none"]),
  })
  .strict() satisfies Schema<SandboxCapabilities>;

const checkSchema = s.discriminatedUnion("ok", [
  s.object({ ok: s.literal(true), reason: s.null(), missing: s.tuple([]) }).strict(),
  s
    .object({
      ok: s.literal(false),
      reason: s.enum(sandboxUnavailableReasons),
      missing: s.array(s.string()),
    })
    .strict(),
]) satisfies Schema<SandboxCheck>;

const fenceSchema = s.discriminatedUnion("state", [
  s.object({ state: s.literal("fenced") }).strict(),
  s.object({ state: s.literal("not-fenced"), reason: s.string() }).strict(),
  s.object({ state: s.literal("off") }).strict(),
  s.object({ state: s.literal("stopped") }).strict(),
]) satisfies Schema<SandboxFence>;

const openedSchema = s.object({ session: s.string().min(1), fence: fenceSchema }).strict();

const blockSchema = s.discriminatedUnion("kind", [
  s
    .object({ kind: s.literal("file"), path: s.string(), access: s.enum(["read", "write"]) })
    .strict(),
  s
    .object({ kind: s.literal("network"), host: s.string(), port: s.number().int().nullable() })
    .strict(),
]) satisfies Schema<SandboxBlock>;

/**
 * The engine's `Sandbox`, as a stand-in for the one the agent host runs
 * (`SrtSandbox`). Opening a session opens it in the host; the programs in
 * it are started there too, by a harness the host runs ({@link AgentHostHarness}).
 * Create it with {@link AgentHostSandbox.connect}, which reads the
 * capabilities once, because the port answers them without waiting.
 */
export class AgentHostSandbox implements Sandbox {
  readonly #transport: AgentHostTransport;
  readonly #capabilities: SandboxCapabilities;

  private constructor(transport: AgentHostTransport, capabilities: SandboxCapabilities) {
    this.#transport = transport;
    this.#capabilities = capabilities;
  }

  /**
   * @throws {@link AgentHostError} when the host refuses, or can't be reached
   */
  static async connect(transport: AgentHostTransport): Promise<AgentHostSandbox> {
    const route = "GET /v1/sandbox/capabilities";
    const capabilities = readAnswer(route, await transport.request(route), capabilitiesSchema);
    return new AgentHostSandbox(transport, capabilities);
  }

  async check(): Promise<SandboxCheck> {
    const route = "GET /v1/sandbox/check";
    return readAnswer(route, await this.#transport.request(route), checkSchema);
  }

  capabilities(): SandboxCapabilities {
    return { ...this.#capabilities };
  }

  /**
   * @throws {@link AgentHostError} with the host's kind, such as `sandbox_open_failed`
   *   with the sandbox's reason, or `too_many_sessions`
   */
  async open(profile: SandboxProfile, options?: { signal?: AbortSignal }): Promise<SandboxSession> {
    const route = "POST /v1/sandbox/sessions/open";
    const signal = options?.signal;
    const answer = await this.#transport.request(route, { profile }, signal ? { signal } : {});
    const opened = readAnswer(route, answer, openedSchema);
    return new AgentHostSession(this.#transport, opened.session, profile, opened.fence);
  }
}

/**
 * A session open in the agent host, named by the id the host made. Its
 * blocked accesses arrive on a stream from the host until it closes.
 */
export class AgentHostSession implements SandboxSession {
  /** The session's id in the host, which a harness run there names. */
  readonly hostId: string;
  readonly profile: SandboxProfile;
  readonly fence: SandboxFence;
  readonly #transport: AgentHostTransport;
  readonly #blocks = new Emitter<{ blocked: SandboxBlock }>();
  readonly #stopBlocked = new AbortController();
  #closed: Promise<void> | undefined;

  constructor(
    transport: AgentHostTransport,
    hostId: string,
    profile: SandboxProfile,
    fence: SandboxFence,
  ) {
    this.#transport = transport;
    this.hostId = hostId;
    this.profile = profile;
    this.fence = fence;
    void this.#readBlocked();
  }

  /**
   * Refused: the session's programs run in the agent host, where a harness
   * starts them.
   */
  start(_command: SandboxCommand): Promise<SandboxProcess> {
    return Promise.reject(
      new Error(
        "This sandbox session is open in the agent host: its programs start there, through a harness the host runs.",
      ),
    );
  }

  onBlocked(listener: SandboxBlockListener): () => void {
    return this.#blocks.on("blocked", listener);
  }

  /** Closes the session in the host. A session the host has already closed (its time limit) counts as closed. */
  close(): Promise<void> {
    this.#closed ??= this.#close();
    return this.#closed;
  }

  async #close(): Promise<void> {
    this.#stopBlocked.abort();
    const route = "POST /v1/sandbox/sessions/close";
    const answer = await this.#transport.request(route, { session: this.hostId });
    if (answer.status === 404) return;
    if (answer.status !== 200) throw answerError(route, answer);
  }

  /** Passes each blocked access to the listeners until the host ends the stream or the session closes. */
  async #readBlocked(): Promise<void> {
    const route = "POST /v1/sandbox/sessions/blocked";
    try {
      const answer = await this.#transport.stream(
        route,
        { session: this.hostId },
        { signal: this.#stopBlocked.signal },
      );
      if (!answer.ok) return;
      for await (const line of answer.lines) {
        const block = parse(blockSchema, line);
        // A line that isn't a block is skipped, not taken for one.
        if (block.ok) this.#emit(block.value as SandboxBlock);
      }
    } catch {
      // The session closed or the host stopped: no more blocks can come.
    }
  }

  #emit(block: SandboxBlock): void {
    try {
      this.#blocks.emit("blocked", block);
    } catch {
      // A listener's own failure doesn't stop the others hearing of the next block.
    }
  }
}
