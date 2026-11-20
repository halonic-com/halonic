import { type AgentPlacement, type HostSettings, newAgentPlacement } from "@halonicjs/app";
import { encodeUtf8 } from "@halonicjs/std";

/** What the agents host applies Settings › New agents run (`sandbox.new-agents`) with. */
export interface NewAgentsParts {
  /** The host settings, where Settings saves the choice. */
  readonly settings: HostSettings;
  /** The "On this computer" choices, kept by the agent host in the person's profile. */
  readonly placement: AgentPlacement;
  /** The workspace's real path, which the choices are kept for. */
  readonly location: string;
  /** Gets a choice that couldn't be saved; the agent is made all the same, in its sandbox. */
  readonly reportError: (error: unknown) => void;
}

/**
 * Applies Settings › New agents run to the agent just made, for its file as written: "On this
 * computer" records that choice for it, anything else leaves it in its sandbox. A choice that
 * can't be saved goes to `reportError` and leaves it in its sandbox too, as does no `parts`.
 */
export async function placeNewAgent(
  parts: NewAgentsParts | undefined,
  hub: string,
  agent: string,
  text: string,
): Promise<void> {
  if (parts === undefined) return;
  const subject = { location: parts.location, hub, agent, file: encodeUtf8(text) };
  try {
    const placed = await newAgentPlacement(parts.settings, parts.placement, subject);
    if (!placed.ok) {
      parts.reportError(new Error(`The new agent's file changed while it was placed: ${agent}.`));
    }
  } catch (error) {
    parts.reportError(error);
  }
}
