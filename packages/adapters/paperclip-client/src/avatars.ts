import type { AttachmentRead, MessagingRefusal } from "@halonicjs/ports";
import type { PaperclipReader } from "./reader.ts";
import { isSafeSegment } from "./requests.ts";
import type { PaperclipFailure } from "./transport.ts";

/** The picture types read: no SVG, which can carry script, and no GIF (Liam, HAL-18485). */
export const avatarTypes: readonly string[] = ["image/png", "image/jpeg", "image/webp"];

/** The largest picture read, in bytes. */
export const avatarMaxBytes = 256 * 1024;

// The query is dropped: Paperclip sizes its own pictures with `?size=512&scale=1`, and its
// default answer is the same picture (HAL-19133).
const avatarPath = /^\/api\/agent-avatars\/([^?#]+)(?:\?[^#]*)?$/;

/**
 * The path under `/api/agent-avatars/` of Paperclip's `avatarUrl` when it names a picture on the
 * connection's own host: one file segment, or Paperclip's own pictures' set, palette and file
 * (HAL-19133). An absolute URL, another path or an unsafe segment gives none, so no picture is
 * ever read from another host.
 *
 * @example
 * avatarPathOf("/api/agent-avatars/ada.png"); // "ada.png"
 * avatarPathOf("/api/agent-avatars/cap-v1/coral-mint/rest.png?size=512"); // "cap-v1/coral-mint/rest.png"
 * avatarPathOf("https://elsewhere.example/api/agent-avatars/ada.png"); // undefined
 */
export function avatarPathOf(avatarUrl: string | undefined): string | undefined {
  const path = avatarUrl === undefined ? undefined : avatarPath.exec(avatarUrl)?.[1];
  return path !== undefined && avatarRequest(path) !== undefined ? path : undefined;
}

type AvatarRequest = {
  readonly name: "readAgentAvatar" | "readAgentAvatarSet";
  readonly path: Readonly<Record<string, string>>;
};

/** The request row and path values for `path`, or `undefined` when it fits neither row. */
function avatarRequest(path: string): AvatarRequest | undefined {
  const segments = path.split("/");
  if (!segments.every(isSafeSegment)) return undefined;
  const [first, second, third] = segments;
  if (segments.length === 1 && first !== undefined) {
    return { name: "readAgentAvatar", path: { avatar: first } };
  }
  if (segments.length === 3 && first !== undefined && second !== undefined && third !== undefined) {
    const values = { avatarSet: first, avatarPalette: second, avatar: third };
    return { name: "readAgentAvatarSet", path: values };
  }
  return undefined;
}

/**
 * Reads the picture at `path` under `/api/agent-avatars/` on the connection's own host, with its
 * key (`ports.agent-messaging-avatars`). A picture of another type or over
 * {@link avatarMaxBytes}, by its stated length or by the bytes that came, is refused, and the
 * rest of its body unread. A redirect throws, as for every request.
 */
export async function readAvatar(reader: PaperclipReader, path: string): Promise<AttachmentRead> {
  const request = avatarRequest(path);
  if (request === undefined) return refused("not-found");
  let picture: AttachmentRead = refused("not-found");
  const answer = await reader.send(
    request.name,
    { path: request.path },
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
export async function readAtMost(response: Response, max: number): Promise<Uint8Array | undefined> {
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

/** The refusal for a failed read: offline and signed out as they are, anything else not found. */
export function refusalFor(failure: PaperclipFailure): MessagingRefusal {
  return failure === "offline" || failure === "signed-out" ? failure : "not-found";
}

function refused(reason: MessagingRefusal): AttachmentRead {
  return { outcome: "refused", reason };
}
