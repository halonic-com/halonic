import { secretVariableName } from "@halonicjs/adapter-env-secrets";
import { defineMessages } from "./define.ts";
import { phrase } from "./phrase.ts";

/**
 * Why a connector's program didn't start, in the words Studio's pages use
 * (`connector-failure.ts` of `@halonicjs/adapter-agent-host-client`, UX
 * check C2, HAL-12410), and the one next step. A line names the program or
 * the secret as the connector's file writes it, never a secret's value or
 * the error's own text. Fix lines: Tomas with Sofia, HAL-13670.
 */
export const connectorStartMessages = defineMessages("connectorStart", {
  programMissing: (program: string) => phrase`The program ${program} isn't on this computer.`,
  /** `file` is the connector's path in the workspace, or `undefined` when it has none (Sofia, HAL-13685). */
  programMissingFix: (program: string, connector: string, file: string | undefined) =>
    file === undefined
      ? phrase`Install ${program}, or change the command in the ${connector} connector file.`
      : phrase`Install ${program}, or change the command in ${file}.`,
  secretMissing: (secret: string) => phrase`The secret ${secret} isn't set on this computer.`,
  secretMissingFix: (secret: string) =>
    phrase`Save it with halonic secret set ${secret}, or set ${secretVariableName(secret)}, then try again.`,
});
