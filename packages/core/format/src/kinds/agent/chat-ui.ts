// An agent's opt-in to components in its Studio chat replies (requirement
// format.agent-chat-ui). It says how a reply may be shown, so it stays apart
// from `output`, which says what the answer's data is. Left out, the agent
// replies in text only.
import { s } from "@halonicjs/schema-kit";

/** The components an agent may draw in a chat reply, in the order Studio lists them. */
export const CHAT_UI_COMPONENTS = ["card", "table", "form", "buttons"] as const;

/** One component name; any other name fails with a message that names it. */
export const ChatUiComponent = s.enum(CHAT_UI_COMPONENTS, {
  error: (issue) =>
    `Unknown chat component ${JSON.stringify(issue.input)}. Use one of: ${CHAT_UI_COMPONENTS.join(", ")}.`,
});

/**
 * `chatUi`: the components the agent may draw in its chat replies, such as
 * `{ components: [card, table, form, buttons] }`. Each name at most once.
 */
export const ChatUi = s
  .object({
    components: s
      .array(ChatUiComponent)
      .min(1)
      .refine((names) => new Set(names).size === names.length, {
        message: "Name each chat component once.",
      }),
  })
  .strict();
