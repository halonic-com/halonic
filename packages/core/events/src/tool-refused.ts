/** The fields every `tool.refused` event has, whatever its reason. */
interface ToolRefusedFields {
  type: "tool.refused";
  agent: string;
  tool: string;
  toolCallId: string;
}

/**
 * A model's tool call was refused before it ran, so it reached nothing
 * (requirement `events.tool-refused`). `tool`: the name exactly as the model
 * wrote it, which may hold look-alike or control characters. `toolCallId`:
 * the model's id for the call. `reason`: `not-offered`, the step offered no
 * tool of that name; `sending-off`, the tool is labelled `send` and its
 * connector may not send, with that connector's id in `connector`. A refused
 * call has no `tool.called` or `tool.result`.
 */
export type ToolRefusedEvent =
  | (ToolRefusedFields & { reason: "not-offered" })
  | (ToolRefusedFields & { reason: "sending-off"; connector: string });

/** Why a model's tool call was refused before it ran (`events.tool-refused`). */
export type ToolRefusalReason = ToolRefusedEvent["reason"];
