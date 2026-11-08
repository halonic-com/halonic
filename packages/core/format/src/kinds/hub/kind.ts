import type { FileKind } from "../../kind.ts";
import { Hub } from "./schema.ts";

/** `hub.yaml` in each `hubs/<id>/` folder; the folder name is the hub's id when the file has none. */
export const hubKind: FileKind<Hub> = {
  name: "hub",
  about: "A hub: a group of agents and workflows with its own defaults.",
  syntax: "yaml",
  schema: Hub,
  places: [{ scope: "hub", folder: "", name: "hub.yaml" }],
  idFromPlace: "fallback",
};
