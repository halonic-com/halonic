import { type Infer, s } from "@halonicjs/schema-kit";
import { id, version } from "../../shared/fields.ts";
import { ModelAlias } from "../models/schema.ts";

/** The shared items a hub takes from its workspace, by kind. */
export const HubUses = s
  .object({
    connectors: s.array(id).default([]),
    skills: s.array(id).default([]),
    knowledge: s.array(id).default([]),
    collections: s.array(id).default([]),
  })
  .strict();

/** `hubs/<id>/hub.yaml`: a hub's name, its defaults and the shared items it uses. */
export const Hub = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    /** Overrides of the workspace defaults (runtime, model alias). */
    defaults: s
      .object({ runtime: s.string().optional(), model: s.string().optional() })
      .strict()
      .default({}),
    /** Hub-level alias overrides, such as "smart" pointing at another model. */
    models: s.record(s.string(), ModelAlias).default({}),
    /**
     * The shared items this hub may use. Without it every shared item is
     * available; with it only the listed ones are, which keeps the hub
     * self-contained.
     */
    uses: HubUses.optional(),
  })
  .strict();

/** A hub, with defaults filled in. */
export type Hub = Infer<typeof Hub>;
/** The shared items a hub lists in `uses`. */
export type HubUses = Infer<typeof HubUses>;
