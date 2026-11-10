import { type Infer, s } from "@halonicjs/schema-kit";
import { id, ModelParams, version } from "../../shared/fields.ts";

/**
 * This workspace's own choices for the session AI (chat sessions, Build
 * mode), on top of the global AI agent each person sets. An empty field
 * follows the global agent.
 */
export const SessionAssistant = s
  .object({
    /** Alias (or "provider/model") new Build sessions start with. */
    model: s.string().min(1).optional(),
    params: ModelParams.optional(),
    /** Model turns one answer may take before it stops and asks to continue. */
    maxSteps: s.number().int().min(1).max(64).optional(),
    /** Whether Build may use the workspace's connector tools that need no approval. */
    connectors: s.boolean().optional(),
    /** Extra instructions, added after the authoring skill and the global agent's. */
    instructions: s.string().optional(),
  })
  .strict();

/** `workspace.yaml`: the workspace's name, privacy, budget and defaults. */
export const WorkspaceSettings = s
  .object({
    version,
    id,
    name: s.string().min(1),
    description: s.string().optional(),
    privacy: s
      .object({
        /** When true, only providers marked `local: true` may be used. */
        localOnly: s.boolean().default(false),
      })
      .strict()
      .default({ localOnly: false }),
    /**
     * Spending limits in `currency`, counted from model prices. Not enforced
     * in 0.1: nothing reads `perRun` or `monthly` yet. `currency` names the
     * currency the prices in `models.yaml` are written in; Halonic doesn't
     * convert between currencies.
     */
    budget: s
      .object({
        currency: s.string().min(1).default("EUR"),
        perRun: s.number().positive().optional(),
        monthly: s.number().positive().optional(),
      })
      .strict()
      .optional(),
    defaults: s
      .object({
        runtime: s.string().default("inprocess"),
        model: s.string().default("default"),
      })
      .strict()
      .default({ runtime: "inprocess", model: "default" }),
    assistant: SessionAssistant.optional(),
    /** How the app looks for everyone who opens this workspace. */
    appearance: s
      .object({
        /** Agent characters: expressive, minimal (an orb with a status ring) or off (initials). */
        characters: s.enum(["expressive", "minimal", "off"]).optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

/** The settings in `workspace.yaml`, with defaults filled in. */
export type WorkspaceSettings = Infer<typeof WorkspaceSettings>;
/** The session AI settings of a workspace. */
export type SessionAssistant = Infer<typeof SessionAssistant>;
