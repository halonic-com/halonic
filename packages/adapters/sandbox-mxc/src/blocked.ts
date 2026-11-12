// What a program's own error output says it was refused. MXC's denial capture
// crashed the host process (HAL-3303), so the adapter never uses it and
// reports only what the child's own errors show, as the ADR says: Node's
// `EACCES` and `EPERM` errors that name a path, and refused connections.
// Messages with no path or address, such as cmd.exe's "Access is denied.",
// say nothing the run log could use, so they are not reported.

import type { SandboxBlock } from "@halonicjs/ports";

/** `EACCES: permission denied, open '<path>'`: the code, then the system call and the path. */
const fileRefusal = /\bE(?:ACCES|PERM)\b[^,\r\n]*, (\w+) '([^'\r\n]+)'/;

/** `connect ECONNREFUSED 127.0.0.1:5000`: the address is everything before the last colon. */
const networkRefusal = /\bconnect (?:ECONNREFUSED|ENETUNREACH|EHOSTUNREACH|EACCES) (\S+):(\d+)/;

/**
 * System calls that change something. The error doesn't say how a file was
 * opened, so `open` counts as a read, like every call that only looks.
 */
const writeCalls = new Set([
  "mkdir",
  "mkdtemp",
  "rmdir",
  "rm",
  "unlink",
  "rename",
  "copyfile",
  "symlink",
  "link",
  "truncate",
  "write",
  "utime",
  "chmod",
  "chown",
]);

/** The refusal one line of error output shows, or `null`. */
export function blockOf(line: string): SandboxBlock | null {
  const file = fileRefusal.exec(line);
  if (file?.[1] !== undefined && file[2] !== undefined) {
    return { kind: "file", path: file[2], access: writeCalls.has(file[1]) ? "write" : "read" };
  }
  const network = networkRefusal.exec(line);
  if (network?.[1] !== undefined && network[2] !== undefined) {
    return { kind: "network", host: network[1], port: Number(network[2]) };
  }
  return null;
}

/** Reports each refusal in `errors`, line by line, until the stream ends. Never rejects. */
export async function watchBlocks(
  errors: ReadableStream<Uint8Array>,
  report: (block: SandboxBlock) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  let pending = "";
  const reportLines = (text: string) => {
    const lines = text.split(/\r?\n/);
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const block = blockOf(line);
      if (block !== null) report(block);
    }
  };
  try {
    for await (const chunk of errors)
      reportLines(pending + decoder.decode(chunk, { stream: true }));
    reportLines(`${pending}${decoder.decode()}\n`);
  } catch {
    // The stream broke with the program: what came before was reported.
  }
}
