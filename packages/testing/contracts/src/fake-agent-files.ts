import type {
  Attachment,
  MessagingId,
  MessagingRefusal,
  OutgoingAttachment,
} from "@halonicjs/ports";

/** A file to put on an item or a message: its bytes, which only `readAttachment` gives back. */
export type FakeAttachment = OutgoingAttachment;

/** A file a {@link FakeAgentFiles} keeps, and the source that holds it. */
export interface KeptFile {
  source: MessagingId;
  file: FakeAttachment;
}

/** Which files the fake's `send` takes, as `FakeAgentMessagingOptions` names them. */
export interface FakeAgentFilesLimits {
  /** The largest file, in bytes; 10 MiB when absent. */
  attachmentLimit?: number;
  /** The file types it takes; any when absent. */
  attachmentTypes?: readonly string[];
}

const defaultLimit = 10 * 1024 * 1024;

/**
 * The files a `FakeAgentMessaging` holds: each attachment's bytes, kept apart from the items that
 * list them so a read of an item never carries bytes, and the check `send` makes on a file.
 */
export class FakeAgentFiles {
  readonly #kept = new Map<MessagingId, KeptFile>();
  readonly #limit: number;
  readonly #types: readonly string[] | undefined;
  readonly #newId: () => MessagingId;

  constructor(limits: FakeAgentFilesLimits, newId: () => MessagingId) {
    this.#limit = limits.attachmentLimit ?? defaultLimit;
    this.#types = limits.attachmentTypes;
    this.#newId = newId;
  }

  /** Keeps each file's bytes for `readAttachment` and gives the attachments an item lists. */
  keep(source: MessagingId, files: readonly FakeAttachment[] = []): Attachment[] {
    return files.map((file) => ({
      id: this.#keepOne(source, file),
      name: file.name,
      type: file.type,
      size: file.bytes.byteLength,
    }));
  }

  /** Keeps an agent's picture, when it has one, and gives the agent's `avatar` field for it. */
  avatar(source: MessagingId, picture: FakeAttachment | undefined): { avatar?: MessagingId } {
    return picture === undefined ? {} : { avatar: this.#keepOne(source, picture) };
  }

  #keepOne(source: MessagingId, file: FakeAttachment): MessagingId {
    const id = this.#newId();
    this.#kept.set(id, { source, file: { ...file, bytes: file.bytes.slice() } });
    return id;
  }

  /** The file kept under this ID, if any. */
  find(attachment: MessagingId): KeptFile | undefined {
    return this.#kept.get(attachment);
  }

  /** Why `send` won't take these files, as the engine checks them whatever a screen did. */
  refusal(files: readonly OutgoingAttachment[]): MessagingRefusal | undefined {
    if (files.some((file) => file.bytes.byteLength > this.#limit)) return "too-large";
    const types = this.#types;
    if (types === undefined) return undefined;
    return files.every((file) => types.includes(file.type)) ? undefined : "unsupported-type";
  }
}
