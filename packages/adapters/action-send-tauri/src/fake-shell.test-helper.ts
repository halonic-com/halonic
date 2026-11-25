import type { ActionRoute, ActionSender, ActionSendRequest, ActionStepRef } from "@halonicjs/ports";
import type { ActionShell, ShellChannel } from "./shell.ts";

/** One `invoke` as it reached the fake shell. */
export interface ShellCall {
  command: string;
  args: Record<string, unknown>;
}

/** The device code the fake shell sends over a sign-in's channel. */
export const acmeUserCode = {
  code: "ACME-1234",
  page: "https://github.com/login/device",
  expiresIn: 900,
};

/**
 * A mocked Tauri `invoke` that answers like the shell's `action_*`
 * commands (`apps/studio/src-tauri/src/actions.rs`): it takes each
 * command's arguments by the shell's names, refuses any other argument as
 * serde's `deny_unknown_fields` would, decides with the sender it is given
 * (the contracts' `FakeActionSender`) as `halonic-action-send` would, and sends every answer through JSON, as
 * the IPC does. `answers` replaces a command's answer, `refusals` rejects
 * it, so a test can give the adapter what a broken or newer shell would.
 */
export class FakeActionShell implements ActionShell {
  readonly calls: ShellCall[] = [];
  readonly answers = new Map<string, unknown>();
  readonly refusals = new Map<string, unknown>();
  /** What the shell sends over a sign-in's channel before it answers. */
  codeMessages: unknown[] = [acmeUserCode];
  readonly #decider: ActionSender & { readonly opened: string[] };
  readonly #channels = new Map<string, (message: unknown) => void>();
  readonly #services: ReadonlySet<string>;
  #nextChannel = 0;

  /**
   * @param decider - decides each command, as the shell's crate does
   * @param routes - the route list; a service with none is unknown to the shell
   */
  constructor(
    decider: ActionSender & { readonly opened: string[] },
    routes: readonly ActionRoute[],
  ) {
    this.#decider = decider;
    this.#services = new Set(routes.map((route) => route.service));
  }

  /** The channels still open, by argument. */
  get openChannels(): readonly string[] {
    return [...this.#channels.keys()];
  }

  openChannel(onMessage: (message: unknown) => void): ShellChannel {
    const argument = `__CHANNEL__:${this.#nextChannel++}`;
    this.#channels.set(argument, onMessage);
    return { argument, close: () => this.#channels.delete(argument) };
  }

  async invoke(command: string, args: Record<string, unknown> = {}): Promise<unknown> {
    this.calls.push({ command, args });
    if (this.refusals.has(command)) throw this.refusals.get(command);
    const answer = this.answers.has(command)
      ? this.answers.get(command)
      : await this.#run(command, args);
    return answer === undefined ? null : JSON.parse(JSON.stringify(answer));
  }

  #run(command: string, args: Record<string, unknown>): Promise<unknown> {
    switch (command) {
      case "action_send":
        expectKeys(command, args, "request");
        return this.#decider.send(args["request"] as ActionSendRequest);
      case "action_open_guided":
        expectKeys(command, args, "request");
        return this.#decider.openGuided(args["request"] as ActionStepRef);
      case "action_open_page":
        expectKeys(command, args, "url");
        this.#decider.opened.push(String(args["url"]));
        return Promise.resolve({ outcome: "opened" });
      case "action_sign_in":
        expectKeys(command, args, "service", "code");
        return this.#signIn(String(args["service"]), String(args["code"]));
      case "action_sign_in_cancel":
        expectKeys(command, args);
        return Promise.resolve(null);
      default:
        return this.#accountCommand(command, args);
    }
  }

  async #accountCommand(command: string, args: Record<string, unknown>): Promise<unknown> {
    expectKeys(command, args, "service");
    const service = String(args["service"]);
    if (!this.#services.has(service)) {
      throw { kind: "unknown_service", message: "the shell has no sign-in for that service" };
    }
    if (command === "action_sign_out") return this.#decider.signOut(service);
    if (command === "action_account") return (await this.#decider.account(service)) ?? null;
    throw `${command} not allowed. Command not found`;
  }

  #signIn(service: string, channel: string): Promise<unknown> {
    const send = this.#channels.get(channel);
    if (send === undefined) throw `no channel ${channel}`;
    for (const message of this.codeMessages) send(message);
    return this.#decider.signIn(service);
  }
}

function expectKeys(command: string, args: Record<string, unknown>, ...names: string[]): void {
  const keys = Object.keys(args).sort();
  if (JSON.stringify(keys) !== JSON.stringify([...names].sort())) {
    throw {
      kind: "invalid_args",
      message: `${command} takes ${names.join(", ")}, not ${keys.join(", ")}`,
    };
  }
}
