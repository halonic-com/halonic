// The tools an agent's model uses to read and keep its notes. The texts here
// are for the model, not for people.

import type { HalonicTool } from "../../agent/turn-tools.ts";
import type { AgentMemory } from "./agent-memory.ts";

/** The names of the memory tools, in the order they are offered. */
export const memoryToolNames = ["memory_list", "memory_save", "memory_forget"] as const;

/** The tools that list, save and forget an agent's notes, in {@link memoryToolNames} order. */
export function memoryTools(memory: AgentMemory): HalonicTool[] {
  return [
    {
      definition: {
        name: "memory_list",
        description:
          "Lists the notes you kept in earlier runs and chats, each with its title and text.",
        parameters: { type: "object", properties: {} },
      },
      run: async () => {
        const notes = await memory.notes();
        if (notes.length === 0) {
          return "You have no notes yet.";
        }
        return notes.map((note) => `## ${note.title}\n\n${note.text}`).join("\n\n");
      },
    },
    {
      definition: {
        name: "memory_save",
        description:
          "Keeps a note for later runs and chats. Saving a title you already used replaces that note.",
        parameters: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "A short title that names what the note is about.",
            },
            text: { type: "string", description: "What to remember." },
          },
          required: ["title", "text"],
        },
      },
      run: async (args) => {
        const note = await memory.save(stringArg(args, "title"), stringArg(args, "text"));
        return `Saved the note "${note.title}".`;
      },
    },
    {
      definition: {
        name: "memory_forget",
        description: "Removes the note with this title.",
        parameters: {
          type: "object",
          properties: { title: { type: "string", description: "The note's title." } },
          required: ["title"],
        },
      },
      run: async (args) => {
        const title = stringArg(args, "title");
        return (await memory.forget(title))
          ? `Removed the note "${title.trim()}".`
          : `There is no note titled "${title.trim()}".`;
      },
    },
  ];
}

function stringArg(args: Record<string, unknown>, name: string): string {
  const value = args[name];
  if (typeof value !== "string") {
    throw new TypeError(`${name} must be a string.`);
  }
  return value;
}
