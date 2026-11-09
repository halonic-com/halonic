import { type CommandSpec, WorkspaceScope } from "../src/index.ts";

// A feature adds its commands and events to the workspace's own lists, so
// every name and payload is checked where it is used.
declare module "../src/index.ts" {
  interface AppCommands {
    "agents.create": CommandSpec<{ name: string }, string>;
  }
  interface AppEvents {
    "agents.created": { id: string };
  }
}

/** Registers a made-up `agents.create` command, runs it once, and describes what happened. */
export async function runExample(): Promise<string[]> {
  const scope = new WorkspaceScope({
    location: "memory:acme",
    onListenerError: (error) => {
      throw error;
    },
  });
  const lines: string[] = [];
  scope.events.on("agents.created", ({ id }) => lines.push(`event: created ${id}`));

  // Exactly one handler per command; it answers the id of the new agent.
  scope.commands.register("agents.create", ({ name }) => {
    const id = name.toLowerCase().replaceAll(" ", "-");
    scope.events.emit("agents.created", { id });
    return id;
  });

  const id = await scope.commands.execute("agents.create", { name: "Senior Clerk" });
  lines.push(`agents.create answered ${id}`);

  await scope.close();
  return lines;
}
