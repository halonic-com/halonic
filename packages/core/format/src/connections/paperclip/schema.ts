import { type Infer, s } from "@halonicjs/schema-kit";

/**
 * `connections/paperclip/<name>.yaml`: one Paperclip server and company a
 * workspace reads live (ADR 2026-11-24, `workspace.paperclip-connection`).
 * It holds only what isn't private: the key lives in the keychain and the
 * data stays in Paperclip, so the file can be committed and shared.
 */
export const PaperclipConnection = s
  .object({
    /** What Studio calls the connection, such as "Halonic". */
    label: s.string().min(1),
    /** The server's address: `https://`, or `http://` only on this machine. */
    address: s.string().min(1),
    /** The Paperclip company's ID on that server. */
    company: s.string().min(1),
  })
  .strict();

/** A Paperclip connection as its file gives it. */
export type PaperclipConnection = Infer<typeof PaperclipConnection>;
