import {
  type AttachmentRefusal,
  attachmentRefusal,
  type MessagingId,
  type OutgoingAttachment,
} from "@halonicjs/ports";

/**
 * A file the person picked or pasted into a chat's box and hasn't sent yet.
 * Its bytes are read only when the message is sent, so a large file costs
 * nothing while it waits. A browser `File` fits it as it is.
 */
export interface DraftFile {
  readonly name: string;
  readonly type: string;
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}

/** The picture types the Messenger draws from bytes; never SVG, which can hold script. */
const pictureTypes: readonly string[] = ["image/png", "image/jpeg", "image/gif", "image/webp"];

/** Whether the Messenger draws a file of this type as a picture once the person asks. */
export function isPicture(type: string): boolean {
  return pictureTypes.includes(type);
}

/**
 * The files waiting in each chat's box (requirement `messenger.files`). A
 * file the port's limits refuse is never added, so the person hears at once,
 * before anything is read or sent.
 */
export class DraftFiles {
  private readonly files = new Map<MessagingId, readonly DraftFile[]>();

  /** The files waiting in a chat's box, in the order they were added. */
  of(conversation: MessagingId): readonly DraftFile[] {
    return this.files.get(conversation) ?? [];
  }

  /** Adds a file to a chat's box, or says why the message can't take it. */
  add(conversation: MessagingId, file: DraftFile): AttachmentRefusal | undefined {
    const files = [...this.of(conversation), file];
    const refusal = attachmentRefusal(files);
    if (refusal !== undefined) return refusal;
    this.files.set(conversation, files);
    return undefined;
  }

  /** Takes the file at `index` out of a chat's box. */
  remove(conversation: MessagingId, index: number): void {
    const files = this.of(conversation).filter((_, at) => at !== index);
    if (files.length === 0) this.files.delete(conversation);
    else this.files.set(conversation, files);
  }

  /** Empties a chat's box of files, once its message is sent. */
  clear(conversation: MessagingId): void {
    this.files.delete(conversation);
  }

  /** Reads each waiting file's bytes, for `AgentMessaging.send`. */
  async outgoing(conversation: MessagingId): Promise<readonly OutgoingAttachment[]> {
    return Promise.all(
      this.of(conversation).map(async (file) => ({
        name: file.name,
        type: file.type,
        bytes: new Uint8Array(await file.arrayBuffer()),
      })),
    );
  }
}
