// The file a new skill, collection or connector starts as, for the
// Library's New dialogs and the assistant (requirement
// `app.new-library-item`). Nothing is written here: the caller puts the
// text at the path as one change, so it can be undone and shows in Changes.

import { err, ok, type Result, slugify, uniqueName } from "@halonicjs/std";
import { filesOf, type LoadedWorkspace } from "@halonicjs/workspace";
import { writeFrontMatter, writeYamlFile } from "@halonicjs/yaml";

/** How a new connector reaches its tools; the same three ways as the New connector dialog. */
export type NewConnectorTransport =
  | { readonly google: { readonly account: string } }
  | { readonly http: { readonly url: string } }
  /** `command` is one line, such as `npx -y @acme/notes-mcp`; its first word is the program. */
  | { readonly stdio: { readonly command: string } };

/** What a person asks for in a New dialog. */
export type NewLibraryItem =
  | {
      readonly kind: "skill";
      readonly name: string;
      readonly description: string;
      /** The hub folder the skill belongs to, or `null` to share it at the workspace root. */
      readonly hub: string | null;
    }
  /** Collections are always shared, so there is no hub. */
  | { readonly kind: "collection"; readonly name: string }
  | {
      readonly kind: "connector";
      readonly name: string;
      readonly hub: string | null;
      readonly transport: NewConnectorTransport;
      /** The name of a secret the connector uses: the bearer token (HTTP) or a program's variable. Never a value. */
      readonly secret?: string;
    };

/** The new file, ready to be written. */
export interface NewLibraryFile {
  /** The id made from the name; `-2`, `-3` and so on when it was taken. */
  readonly id: string;
  /** The workspace-relative path, with `/` separators. */
  readonly path: string;
  readonly text: string;
}

/** Why no file was made. The caller words each one. */
export type NewLibraryItemError =
  | "name_missing"
  | "description_missing"
  /** A connector needs its account, URL or command. */
  | "connection_missing";

/** Where a new item's file sits for an id; the same places the kinds register. */
function pathOf(item: NewLibraryItem, id: string): string {
  const root = item.kind !== "collection" && item.hub !== null ? `hubs/${item.hub}/` : "";
  switch (item.kind) {
    case "skill":
      return `${root}library/skills/${id}/SKILL.md`;
    case "collection":
      return `library/collections/${id}.collection.yaml`;
    case "connector":
      return `${root}library/connectors/${id}.connector.yaml`;
  }
}

/** The ids already used by this kind where the new item would sit. */
function takenIds(workspace: LoadedWorkspace, item: NewLibraryItem): string[] {
  const hub = item.kind === "collection" ? null : item.hub;
  return filesOf(workspace, item.kind)
    .filter((file) => file.hub === hub)
    .map((file) => file.value.id);
}

/**
 * A connector's transport as the file holds it. A secret is only ever
 * named: a bearer token for HTTP, a variable of the same name for a program.
 */
function transportOf(item: Extract<NewLibraryItem, { kind: "connector" }>) {
  const { transport, secret } = item;
  if ("google" in transport) {
    return { transport: { google: { account: transport.google.account.trim() } } };
  }
  if ("http" in transport) {
    return {
      transport: { http: { url: transport.http.url.trim() } },
      ...(secret ? { secret } : {}),
    };
  }
  const [command = "", ...args] = transport.stdio.command.trim().split(/\s+/);
  return {
    transport: {
      stdio: { command, args, ...(secret ? { secretEnv: { [secret]: secret } } : {}) },
    },
  };
}

function connectionOf(item: Extract<NewLibraryItem, { kind: "connector" }>): string {
  const { transport } = item;
  if ("google" in transport) {
    return transport.google.account;
  }
  return "http" in transport ? transport.http.url : transport.stdio.command;
}

/** The text of the new file. */
function textOf(item: NewLibraryItem, id: string): string {
  const name = item.name.trim();
  switch (item.kind) {
    case "skill":
      return `---\n${writeFrontMatter({ name, description: item.description.trim() })}\n---\n`;
    case "collection":
      return writeYamlFile({
        version: 1,
        id,
        name,
        fields: { name: { type: "text", required: true } },
      });
    case "connector":
      // `approve: all` makes every tool the server offers ask a person first,
      // without naming them, so a tool the server adds later asks too.
      return writeYamlFile({
        version: 1,
        id,
        name,
        ...transportOf(item),
        tools: { approve: "all" },
      });
  }
}

/**
 * Makes the file for a new skill, collection or connector. The id comes from
 * the name, with `-2`, `-3` when another item of that kind in the same place
 * has it. A new connector asks about every tool (`tools.approve: all`); this
 * is the one place that rule lives. Nothing is connected or started.
 *
 * @example
 * newLibraryFile(workspace, { kind: "collection", name: "Claims" });
 * // ok({ id: "claims", path: "library/collections/claims.collection.yaml", text: "…" })
 */
export function newLibraryFile(
  workspace: LoadedWorkspace,
  item: NewLibraryItem,
): Result<NewLibraryFile, NewLibraryItemError> {
  if (item.name.trim() === "") {
    return err("name_missing");
  }
  if (item.kind === "skill" && item.description.trim() === "") {
    return err("description_missing");
  }
  if (item.kind === "connector" && connectionOf(item).trim() === "") {
    return err("connection_missing");
  }
  const id = uniqueName(slugify(item.name), takenIds(workspace, item));
  return ok({ id, path: pathOf(item, id), text: textOf(item, id) });
}
