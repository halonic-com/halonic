import {
  type NewConnectorTransport,
  type NewLibraryItemError,
  newLibraryFile,
} from "@halonicjs/app";
import { KindedError } from "@halonicjs/std";
import type {
  ConnectorRef,
  LibraryItemPlace,
  NewConnectorDraft,
  NewConnectorHost,
  NewConnectorHub,
  NewConnectorWay,
} from "@halonicjs/studio-feature-library/api";
import { filesOf, type LoadedWorkspace, loadWorkspace } from "@halonicjs/workspace";
import { unsavedSource } from "./workspace-library-items.ts";
import type { WorkspaceSkillsParts } from "./workspace-skills.ts";

/** The ways the dialog offers, in the order it shows them. */
const ways: readonly NewConnectorWay[] = ["google", "http", "stdio"];

/**
 * The Gmail and Google Drive tools that change or send something. A new Google connector asks a
 * person before each of them; reading and searching don't ask.
 */
export const googleAskFirst: readonly string[] = [
  "gmail_modify_labels",
  "gmail_create_draft",
  "gmail_send",
  "gmail_send_draft",
  "drive_create_file",
  "drive_update_file",
  "drive_create_folder",
  "drive_move_file",
];

/**
 * The words of each reason core gives a connector for making no file; a sentence, as the dialog
 * shows it. A skill's `description_missing` never comes for a connector, so it falls back to
 * {@link cantMake}.
 */
const refusals: Partial<Record<NewLibraryItemError, string>> = {
  name_missing: "Give it a name.",
  connection_missing: "Say how it connects.",
  secret_invalid: "Use a secret's name, not its value.",
};
const cantMake = "Check the fields, then try again.";

function transportOf(draft: NewConnectorDraft): NewConnectorTransport {
  switch (draft.way) {
    case "google":
      return { google: { account: draft.account, askFirst: googleAskFirst } };
    case "http":
      return { http: { url: draft.url } };
    case "stdio":
      return { stdio: { command: draft.command } };
  }
}

/**
 * Makes connectors for the New connector dialog (`studio.workspace-new-connector`). Core's
 * `newLibraryFile` makes the id, path and text; the file is written as one change that shows in
 * Changes and can be undone. Nothing is connected or started. The dialog asks for the hubs and the
 * file while it is open, so they are read from a snapshot of the workspace that `prepare` and
 * `create` load again.
 *
 * @example
 * services.provide(NewConnectorHostService, new WorkspaceNewConnector({ files, onChange }));
 */
export class WorkspaceNewConnector implements NewConnectorHost {
  readonly #parts: WorkspaceSkillsParts;
  #snapshot: LoadedWorkspace | undefined;

  /** Told the name of each item made, so its tab can show it before the Library reads it again. */
  readonly #made: ((place: LibraryItemPlace, name: string) => void) | undefined;

  constructor(parts: WorkspaceSkillsParts, made?: (place: LibraryItemPlace, name: string) => void) {
    this.#parts = parts;
    this.#made = made;
  }

  async prepare(): Promise<void> {
    await this.#load();
  }

  hubs(): readonly NewConnectorHub[] {
    if (this.#snapshot === undefined) return [];
    return filesOf(this.#snapshot, "hub").map((hub) => ({
      id: hub.value.id,
      name: hub.value.name,
    }));
  }

  ways(): readonly NewConnectorWay[] {
    return ways;
  }

  file({ name, hub }: Pick<NewConnectorDraft, "name" | "hub">): string {
    // The connection is a placeholder: only the path is wanted, and a made file needs one.
    const made =
      this.#snapshot === undefined || name.trim() === ""
        ? undefined
        : newLibraryFile(this.#snapshot, {
            kind: "connector",
            name,
            hub,
            transport: { http: { url: "-" } },
          });
    if (made?.ok) return made.value.path;
    return `${hub === null ? "" : `hubs/${hub}/`}library/connectors/`;
  }

  async create(draft: NewConnectorDraft): Promise<ConnectorRef> {
    const made = newLibraryFile(await this.#load(), {
      kind: "connector",
      name: draft.name,
      hub: draft.hub,
      transport: transportOf(draft),
      ...(draft.secret === "" || draft.way === "google" ? {} : { secret: draft.secret }),
    });
    if (!made.ok) throw new KindedError("invalid_input", refusals[made.error] ?? cantMake);
    const { id, path, text } = made.value;
    this.#parts.files.change(`Added connector ${id}`, { [path]: text });
    this.#made?.({ hub: draft.hub, id }, draft.name.trim());
    return { hub: draft.hub, id };
  }

  async #load(): Promise<LoadedWorkspace> {
    this.#snapshot = await loadWorkspace(unsavedSource(this.#parts.files));
    return this.#snapshot;
  }
}
