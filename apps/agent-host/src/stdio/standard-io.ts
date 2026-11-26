import { redactStandardError } from "../engine/secret-redactor.ts";
import type { HostIo } from "../host.ts";
import { takeStandardOutput } from "./standard-output.ts";

/** The host's own standard input, output and error. */
export function standardIo(): HostIo {
  return {
    input: process.stdin,
    write: (text) => process.stdout.write(text),
    writeError: (text) => process.stderr.write(text),
    redactStandardError: (redactor) => redactStandardError(redactor),
    takeOutput: () => takeStandardOutput(),
  };
}
