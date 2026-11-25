import type { AttachmentRead, MessagingRefusal } from "@halonicjs/ports";
import type { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import type { PaperclipFailure } from "./transport.ts";

/** The picture types read: no SVG, which can carry script, and no GIF (Liam, HAL-18485). */
export const avatarTypes: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/** The largest picture read, in bytes. */
export const avatarMaxBytes = 256 * 1024;

const avatarPath = /^\/api\/agent-avatars\/([^/?#]+)$/;

/**
 * The file segment of Paperclip's `avatarUrl` when it names a picture on the connection's own
 * host: a path under `/api/agent-avatars/` and nothing more. An absolute URL, another path, a
 * query or an unsafe segment gives none, so no picture is ever read from another host.
 *
 * @example
 * avatarSegment("/api/agent-avatars/ada.png"); // "ada.png"
 * avatarSegment("https://elsewhere.example/api/agent-avatars/ada.png"); // undefined
 */
export function avatarSegment(avatarUrl: string | undefined): string | undefined {
  const segment = avatarUrl === undefined ? undefined : avatarPath.exec(avatarUrl)?.[1];
  return segment !== undefined && isSafeSegment(segment) ? segment : undefined;
}

/**
 * Reads the picture with file segment `segment` on the connection's own host, with its key
 * (`ports.agent-messaging-avatars`). A picture of another type or over {@link avatarMaxBytes},
 * by its stated length or by the bytes that came, is refused, and the rest of its body unread.
 * A redirect throws, as for every request.
 */
export async function readAvatar(
  reader: PaperclipReader,
  segment: string,
): Promise<AttachmentRead> {
  if (!isSafeSegment(segment)) return refused("not-found");
  let picture: AttachmentRead = refused("not-found");
  const answer = await reader.send(
    "readAgentAvatar",
    { path: { avatar: segment } },
    {
      accept: avatarTypes.join(", "),
      read: async (_name, response) => {
        picture = await readPicture(response);
        return { kind: "ok", body: undefined };
      },
    },
  );
  return answer.kind === "failed" ? refused(refusalFor(answer.failure)) : picture;
}

async function readPicture(response: Response): Promise<AttachmentRead> {
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
  if (!avatarTypes.includes(type)) {
    await response.body?.cancel();
    return refused("unsupported-type");
  }
  // A missing or unreadable length is checked on the bytes alone.
  if (Number(response.headers.get("content-length")) > avatarMaxBytes) {
    await response.body?.cancel();
    return refused("too-large");
  }
  let bytes: Uint8Array | undefined;
  try {
    bytes = await readAtMost(response, avatarMaxBytes);
  } catch {
    // The line dropped partway through the body: as for a request that never got through.
    return refused("offline");
  }
  return bytes === undefined ? refused("too-large") : { outcome: "read", bytes, type };
}

/** The body's bytes, or `undefined` as soon as more than `max` came; the rest is never read. */
async function readAtMost(response: Response, max: number): Promise<Uint8Array | undefined> {
  if (response.body === null) return new Uint8Array();
  const stream = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let chunk = await stream.read();
  while (!chunk.done) {
    size += chunk.value.byteLength;
    if (size > max) {
      await stream.cancel();
      return undefined;
    }
    chunks.push(chunk.value);
    chunk = await stream.read();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const each of chunks) {
    bytes.set(each, offset);
    offset += each.byteLength;
  }
  return bytes;
}

function refusalFor(failure: PaperclipFailure): MessagingRefusal {
  return failure === "offline" || failure === "signed-out" ? failure : "not-found";
}

function refused(reason: MessagingRefusal): AttachmentRead {
  return { outcome: "refused", reason };
}
