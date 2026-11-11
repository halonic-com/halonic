import { Writable } from "node:stream";

/**
 * Takes standard output over for the frames of `--stdio` mode. One stray
 * print there (a library's `console.log`, say) would break the frame
 * stream for every connection, so from now on whatever else writes to
 * `stdout` goes to `stderr` instead, and only the returned stream reaches
 * standard output.
 *
 * @param stdout - the process's standard output; tests pass their own
 * @param stderr - where everything else goes from now on
 * @returns the only way left to standard output. It fails when standard output does.
 */
export function takeStandardOutput(
  stdout: NodeJS.WriteStream | Writable = process.stdout,
  stderr: NodeJS.WriteStream | Writable = process.stderr,
): Writable {
  const writeOut = stdout.write.bind(stdout);
  stdout.write = stderr.write.bind(stderr) as typeof stdout.write;
  const output = new Writable({
    write(chunk: Buffer, _encoding, done) {
      writeOut(chunk, (error) => done(error ?? null));
    },
  });
  stdout.on("error", (error) => output.destroy(error));
  return output;
}
