import type { NewConnectorDraft, NewConnectorWay } from "./new-connector-host.ts";
import { newConnectorWords } from "./new-connector-words.ts";

/** The field errors of a draft, each only for a field the picked way uses. */
export interface NewConnectorErrors {
  readonly name?: string;
  readonly account?: string;
  readonly url?: string;
  readonly command?: string;
  readonly secret?: string;
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const secretNamePattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

function isWebAddress(text: string): boolean {
  try {
    const { protocol } = new URL(text.trim());
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * What is wrong with what was typed, in the order the dialog shows it. With no way picked yet,
 * only the name can be wrong. Gmail and Google Drive has
 * no Secret: its secrets are added on the connector's page.
 *
 * @example
 * newConnectorErrors({ ...draft, way: "http", url: "notes" }).url;
 * // "Enter a full address, like https://mcp.example.com."
 */
export function newConnectorErrors(
  draft: Omit<NewConnectorDraft, "way"> & { readonly way: NewConnectorWay | null },
): NewConnectorErrors {
  const errors: { -readonly [Key in keyof NewConnectorErrors]: string } = {};
  if (draft.name.trim() === "") errors.name = newConnectorWords.nameMissing;
  if (draft.way === "google" && !emailPattern.test(draft.account.trim())) {
    errors.account = newConnectorWords.accountInvalid;
  }
  if (draft.way === "http" && !isWebAddress(draft.url)) errors.url = newConnectorWords.urlInvalid;
  if (draft.way === "stdio" && draft.command.trim() === "") {
    errors.command = newConnectorWords.commandMissing;
  }
  const secret = draft.secret.trim();
  if (
    draft.way !== null &&
    draft.way !== "google" &&
    secret !== "" &&
    !secretNamePattern.test(secret)
  ) {
    errors.secret = newConnectorWords.secretInvalid;
  }
  return errors;
}
