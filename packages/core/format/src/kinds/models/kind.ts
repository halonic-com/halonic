import type { FileKind } from "../../kind.ts";
import { Models } from "./schema.ts";

/** `models.yaml` at the workspace root. */
export const modelsKind: FileKind<Models> = {
  name: "models",
  about: "The model aliases agents use, each a provider's model with fallbacks and a price.",
  syntax: "yaml",
  schema: Models,
  places: [{ scope: "workspace", folder: "", name: "models.yaml" }],
  idFromPlace: "none",
};
