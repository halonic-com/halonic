/**
 * Reads a program's output to its end and keeps only the last
 * `keptCharacters` of it, so a program that prints a lot can't fill the
 * memory (requirement `harness-kit.read-lines`). Reading it to the end also
 * keeps the program from stalling on a full pipe. A harness reads its
 * program's standard error this way, to say why a run failed.
 *
 * @example
 * const errorTail = outputTail(process.stderr, 4_096).catch(() => "");
 */
export async function outputTail(
  output: ReadableStream<Uint8Array>,
  keptCharacters: number,
): Promise<string> {
  const decoder = new TextDecoder();
  let tail = "";
  for await (const chunk of output) {
    tail = (tail + decoder.decode(chunk, { stream: true })).slice(-keptCharacters);
  }
  return (tail + decoder.decode()).slice(-keptCharacters);
}
