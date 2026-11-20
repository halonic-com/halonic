import type { Readable, Writable } from "node:stream";
import { ControlFrameDecoder, ControlPipeFault, encodeControlFrame } from "./control-frames.ts";
import {
  type BrokerAnswer,
  type HandshakeMessage,
  type HealthMessage,
  maxOpenBrokerRequests,
  type RequestId,
  type SandboxHostMessage,
  type SecretAnswerMessage,
  type ShellMessage,
  type StoppedMessage,
} from "./control-messages.ts";
import { parseShellMessage } from "./shell-messages.ts";

/** What the engine does when the shell says something. Each is called on the pipe's own events. */
export interface ControlPipeHandlers {
  /** The sandbox host's newest connection, or `null` when none runs. */
  sandboxHost(connection: SandboxHostMessage["connection"]): void;
  /** The shell asked the engine to stop. */
  stop(): void;
  /** The pipe broke the protocol or failed: the engine must stop. Called at most once. */
  fault(error: ControlPipeFault): void;
  /** Standard input ended: the shell is gone, and the engine must stop. */
  end(): void;
}

/** What the engine may ask the shell's broker for. */
export type BrokerRequestKind = "secret_get" | "token_get" | "origins_get";

interface OpenRequest {
  readonly kind: BrokerRequestKind;
  resolve(answer: BrokerAnswer): void;
  reject(error: Error): void;
}

/**
 * The engine's end of the control pipe: its standard input and its own
 * writer for standard output, which nothing else writes to. It numbers the
 * broker requests, matches each answer to its request, and stops at the first
 * fault: anything the shell sends that breaks the protocol, an answer to no
 * open request, or an answer of the wrong kind.
 */
export class ControlPipe {
  readonly #output: Writable;
  readonly #handlers: ControlPipeHandlers;
  readonly #decoder = new ControlFrameDecoder();
  readonly #open = new Map<RequestId, OpenRequest>();
  #nextId: RequestId = 1;
  #handshakeSent = false;
  #closed = false;

  constructor(input: Readable, output: Writable, handlers: ControlPipeHandlers) {
    this.#output = output;
    this.#handlers = handlers;
    input.on("data", (chunk: Buffer) => this.#receive(chunk));
    input.on("end", () => this.#close(null));
    input.on("error", () => this.#close(new ControlPipeFault("Standard input failed.")));
    output.on("error", () => this.#close(new ControlPipeFault("Standard output failed.")));
  }

  /**
   * Sends one of the engine's own messages. The handshake goes first.
   *
   * @throws Error when anything but the handshake comes before it, which the shell would count as a fault
   */
  send(message: HandshakeMessage | HealthMessage | StoppedMessage): void {
    if (this.#closed) return;
    if (message.kind === "handshake") {
      this.#handshakeSent = true;
    } else if (!this.#handshakeSent) {
      throw new Error("The engine sends its handshake before anything else.");
    }
    this.#output.write(encodeControlFrame(message));
  }

  /**
   * Asks the shell's broker. With {@link maxOpenBrokerRequests} requests
   * unanswered it answers `busy` itself, as the broker would, without asking.
   *
   * @throws Error when the pipe closed before the answer, or the handshake wasn't sent
   */
  ask(kind: BrokerRequestKind, name: string): Promise<BrokerAnswer> {
    if (this.#closed) return Promise.reject(new Error("The control pipe is closed."));
    if (!this.#handshakeSent) {
      return Promise.reject(new Error("The engine sends its handshake before anything else."));
    }
    if (this.#open.size >= maxOpenBrokerRequests) {
      return Promise.resolve({ result: "refused", reason: "busy" });
    }
    const id = this.#nextId++;
    return new Promise<BrokerAnswer>((resolve, reject) => {
      this.#open.set(id, { kind, resolve, reject });
      this.#output.write(encodeControlFrame({ kind, id, name }));
    });
  }

  #receive(chunk: Buffer): void {
    if (this.#closed) return;
    try {
      for (const value of this.#decoder.push(chunk)) {
        this.#dispatch(parseShellMessage(value));
        if (this.#closed) return;
      }
    } catch (error) {
      this.#close(error instanceof ControlPipeFault ? error : new ControlPipeFault("Bad frame."));
    }
  }

  #dispatch(message: ShellMessage): void {
    switch (message.kind) {
      case "sandbox_host":
        this.#handlers.sandboxHost(message.connection);
        return;
      case "stop":
        this.#handlers.stop();
        return;
      default:
        this.#answer(message);
    }
  }

  #answer(message: SecretAnswerMessage): void {
    const { kind: _kind, id, ...answer } = message;
    const request = this.#open.get(id);
    if (request === undefined) {
      throw new ControlPipeFault("The shell answered a request that isn't open.");
    }
    if (!answerFits(request.kind, answer)) {
      throw new ControlPipeFault("The shell's answer doesn't fit its request.");
    }
    this.#open.delete(id);
    request.resolve(answer);
  }

  /** Ends the pipe once: `fault` is `null` when the shell closed it cleanly. */
  #close(fault: ControlPipeFault | null): void {
    if (this.#closed) return;
    this.#closed = true;
    const reason = fault ?? new Error("The shell closed the control pipe.");
    for (const request of this.#open.values()) request.reject(reason);
    this.#open.clear();
    if (fault === null) {
      this.#handlers.end();
    } else {
      this.#handlers.fault(fault);
    }
  }
}

/** A value answers a secret or a token, origins answer origins; the rest answer any request. */
function answerFits(kind: BrokerRequestKind, answer: BrokerAnswer): boolean {
  if (answer.result === "value") return kind !== "origins_get";
  if (answer.result === "origins") return kind === "origins_get";
  return true;
}
