import type {
  ActionAccount,
  ActionOpenResult,
  ActionSender,
  ActionSendRequest,
  ActionSendResult,
  ActionService,
  ActionSignInResult,
  ActionStepRef,
} from "@halonicjs/ports";
import { ActionShellError, malformedAnswer, shellFailure } from "./action-shell-error.ts";
import {
  readAccount,
  readNothing,
  readOpenResult,
  readSendResult,
  readSignInResult,
  readUserCode,
} from "./answers.ts";
import { type ActionShell, type ActionUserCode, actionCommands } from "./shell.ts";

/**
 * The {@link ActionSender} of the desktop Studio, over the shell's
 * `action_*` commands (requirement `action-send-tauri.commands`). The shell
 * does every check that matters: it holds the compiled route list, refuses
 * anything off it, reads the token from the OS keychain itself, asks for
 * confirmation in its native dialog and hands back only kept fields. This
 * adapter passes the page's request on as it is, and reads each answer
 * against an allow-list of fields, refusing one it doesn't know. No token
 * passes through it: no command takes or gives one.
 *
 * A shell failure the port has no answer for (the shell refuses the call,
 * the browser doesn't open a page, a sign-in fails, an answer is malformed)
 * rejects with an {@link ActionShellError}.
 *
 * @example
 * const sender = new TauriActionSender(shell);
 * const result = await sender.signIn("github", (code) => showCode(code));
 */
export class TauriActionSender implements ActionSender {
  readonly #shell: ActionShell;

  /** @param shell - the page's IPC into the shell, from `studio/services` */
  constructor(shell: ActionShell) {
    this.#shell = shell;
  }

  async account(service: ActionService): Promise<ActionAccount | undefined> {
    try {
      return readAccount(service, await this.#call(actionCommands.account, { service }));
    } catch (error) {
      // Nobody can be signed in to a service the shell has no sign-in for.
      if (isUnknownService(error)) return undefined;
      throw error;
    }
  }

  /**
   * Starts the service's sign-in; the shell opens its page in the user's
   * browser. Called only from a user's click, never from a request.
   *
   * @param showCode - shows the device code the user types on that page;
   *   without it the user has no code to type
   * @throws ActionShellError when the sign-in fails, a sign-in page opened a
   *   moment ago (`too-often`) or the shell sends a code that isn't one
   */
  async signIn(
    service: ActionService,
    showCode?: (code: ActionUserCode) => void,
  ): Promise<ActionSignInResult> {
    let cancelling: Promise<unknown> | undefined;
    const channel = this.#shell.openChannel((message) => {
      const code = readUserCode(message);
      if (code !== undefined) {
        showCode?.(code);
        return;
      }
      // Stop the poll now; once it has stopped, the sign-in rejects.
      cancelling ??= this.cancelSignIn().then(
        () => undefined,
        (reason: unknown) => reason,
      );
    });
    try {
      const answer = await this.#call(actionCommands.signIn, { service, code: channel.argument });
      if (cancelling !== undefined) {
        const cause = await cancelling;
        const error = malformedAnswer(actionCommands.signIn);
        if (cause !== undefined) error.cause = cause;
        throw error;
      }
      return readSignInResult(service, answer);
    } finally {
      channel.close();
    }
  }

  /** Cancels the sign-in this page started; nothing it hasn't stored yet is kept. */
  async cancelSignIn(): Promise<void> {
    readNothing(actionCommands.cancelSignIn, await this.#call(actionCommands.cancelSignIn, {}));
  }

  async signOut(service: ActionService): Promise<void> {
    try {
      readNothing(actionCommands.signOut, await this.#call(actionCommands.signOut, { service }));
    } catch (error) {
      if (isUnknownService(error)) return;
      throw error;
    }
  }

  async send(request: ActionSendRequest): Promise<ActionSendResult> {
    return readSendResult(await this.#call(actionCommands.send, { request }));
  }

  async openGuided(request: ActionStepRef): Promise<ActionOpenResult> {
    const answer = await this.#call(actionCommands.openGuided, { request });
    return readOpenResult(actionCommands.openGuided, answer);
  }

  /**
   * Opens a `browser` block's page in the user's browser, if the shell's
   * web-origin allow-list has it, or refuses it.
   */
  async openPage(address: string): Promise<ActionOpenResult> {
    const answer = await this.#call(actionCommands.openPage, { url: address });
    return readOpenResult(actionCommands.openPage, answer);
  }

  async #call(command: string, args: Record<string, unknown>): Promise<unknown> {
    try {
      return await this.#shell.invoke(command, args);
    } catch (reason) {
      throw shellFailure(command, reason);
    }
  }
}

function isUnknownService(error: unknown): boolean {
  return error instanceof ActionShellError && error.failure === "unknown_service";
}
