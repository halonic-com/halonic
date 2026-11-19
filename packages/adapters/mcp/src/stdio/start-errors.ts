/**
 * The program a connector names isn't on this computer: no absolute folder
 * of its `PATH` has it. The message is ours; `program` is the name as the
 * connector's file wrote it, so a caller can say which program to install
 * without passing on any other text.
 */
export class ProgramNotFoundError extends Error {
  override readonly name = "ProgramNotFoundError";
  /** The program as the connector's `command` names it, such as `npx`. */
  readonly program: string;

  /**
   * @param program - the missing program, as the connector names it
   * @param message - ours, safe to log; by default it says the `PATH` has no such program
   */
  constructor(
    program: string,
    message = `The program ${program} was not found in any absolute folder of the PATH.`,
  ) {
    super(message);
    this.program = program;
  }
}

/**
 * A secret a connector's `secretEnv` names has no value, so its program
 * doesn't start. `secretName` is the secret's name, never a value.
 */
export class SecretNotSetError extends Error {
  override readonly name = "SecretNotSetError";
  /** The secret's name, such as `NOTES_TOKEN`. */
  readonly secretName: string;

  constructor(connectorId: string, secretName: string) {
    super(`Connector "${connectorId}" needs the secret "${secretName}", which isn't set.`);
    this.secretName = secretName;
  }
}
