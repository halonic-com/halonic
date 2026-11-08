/** A Web global in Node, Workers and browsers that the kit's Web types don't list. */
type DecompressionStreamConstructor = new (
  format: "gzip" | "deflate",
) => TransformStream<Uint8Array, Uint8Array>;

/** The content codings the kit can undo, and the bytes each format starts with. */
const decoders = new Map<
  string,
  { format: "gzip" | "deflate"; startsAs: (head: Uint8Array) => boolean }
>([
  ["gzip", { format: "gzip", startsAs: isGzip }],
  ["x-gzip", { format: "gzip", startsAs: isGzip }],
  ["deflate", { format: "deflate", startsAs: isZlib }],
]);

/**
 * The body decompressed, when the response says it is gzip or deflate and
 * its bytes still are. `decoded` says the body is now plain either way, so
 * `content-encoding` no longer applies. `fetch` in Node and in Workers already decompresses
 * but leaves `content-encoding` in place, so the kit looks at the bytes, not
 * only the header, and never decompresses twice. The secret filter then
 * sees the bytes the integration will read.
 */
export function decompressed(
  body: ReadableStream<Uint8Array>,
  contentEncoding: string | null,
): { stream: ReadableStream<Uint8Array>; decoded: boolean } {
  const coding = contentEncoding?.split(",").at(-1)?.trim().toLowerCase() ?? "";
  const decoder = decoders.get(coding);
  if (decoder === undefined) return { stream: body, decoded: false };
  const source = body.getReader();
  let output: ReadableStreamDefaultReader<Uint8Array> | undefined;
  // The first bytes are read only when the integration first reads, so the
  // kit's idle timeout and abort apply to them like to every other piece.
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      output ??= await chooseOutput(source, decoder);
      const next = await output.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: (reason) => (output ?? source).cancel(reason),
  });
  return { stream, decoded: true };
}

async function chooseOutput(
  source: ReadableStreamDefaultReader<Uint8Array>,
  decoder: { format: "gzip" | "deflate"; startsAs: (head: Uint8Array) => boolean },
): Promise<ReadableStreamDefaultReader<Uint8Array>> {
  const head: Uint8Array[] = [];
  let headBytes = 0;
  while (headBytes < 2) {
    const next = await source.read();
    if (next.done) break;
    head.push(next.value);
    headBytes += next.value.length;
  }
  const replayed = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const piece of head) controller.enqueue(piece);
    },
    async pull(controller) {
      const next = await source.read();
      if (next.done) controller.close();
      else controller.enqueue(next.value);
    },
    cancel: (reason) => source.cancel(reason),
  });
  if (!decoder.startsAs(firstTwo(head))) return replayed.getReader();
  return replayed.pipeThrough(new (decompressionStream())(decoder.format)).getReader();
}

function decompressionStream(): DecompressionStreamConstructor {
  const found = (globalThis as { DecompressionStream?: DecompressionStreamConstructor })
    .DecompressionStream;
  if (found === undefined) throw new Error("this runtime has no DecompressionStream");
  return found;
}

function firstTwo(head: readonly Uint8Array[]): Uint8Array {
  const bytes = head.flatMap((piece) => [...piece.subarray(0, 2)]).slice(0, 2);
  return Uint8Array.from(bytes);
}

/** gzip's magic number, RFC 1952. */
function isGzip(head: Uint8Array): boolean {
  return head[0] === 0x1f && head[1] === 0x8b;
}

/** A zlib header with the deflate method and a valid check, RFC 1950. */
function isZlib(head: Uint8Array): boolean {
  const [cmf = 0, flg = 0] = head;
  return (cmf & 0x0f) === 8 && cmf >> 4 <= 7 && ((cmf << 8) | flg) % 31 === 0;
}
