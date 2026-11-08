import { describe, expect, it } from "vitest";
import { type CommandSpec, WorkspaceScope } from "./index.ts";

// What a feature package writes to add its own commands and events, with
// `declare module "@halonicjs/app"` there; inside this package the check
// rules ask for the relative path. `tsc -p tsconfig.test.json` checks this
// file, so the `@ts-expect-error` lines below prove that wrong names and
// payloads don't compile.
declare module "./workspace-scope.ts" {
  interface AppCommands {
    "typing.rename": CommandSpec<{ from: string; to: string }, boolean>;
  }
  interface AppEvents {
    "typing.renamed": { from: string; to: string };
  }
}

function openScope() {
  return new WorkspaceScope({ location: "memory:typing", onListenerError: () => {} });
}

describe("app.command-bus: features add typed commands and events", () => {
  it("checks the names and payloads a feature adds", async () => {
    const scope = openScope();
    const renamed: string[] = [];
    scope.events.on("typing.renamed", ({ from, to }) => renamed.push(`${from} -> ${to}`));
    scope.commands.register("typing.rename", ({ from, to }) => {
      scope.events.emit("typing.renamed", { from, to });
      return true;
    });

    expect(await scope.commands.execute("typing.rename", { from: "a", to: "b" })).toBe(true);
    expect(renamed).toEqual(["a -> b"]);
  });

  it("rejects unknown names and wrong payloads at compile time", () => {
    const scope = openScope();
    // Never called: only `tsc` looks at these.
    const wrongUses = [
      // @ts-expect-error: no such command
      () => scope.commands.execute("typing.unknown"),
      // @ts-expect-error: `to` is missing
      () => scope.commands.execute("typing.rename", { from: "a" }),
      // @ts-expect-error: the command needs its input
      () => scope.commands.execute("typing.rename"),
      // @ts-expect-error: a handler must answer a boolean
      () => scope.commands.register("typing.rename", () => "yes"),
      // @ts-expect-error: no such event
      () => scope.events.on("typing.unknown", () => {}),
      // @ts-expect-error: wrong payload for the event
      () => scope.events.emit("typing.renamed", { from: 1, to: "b" }),
    ];
    expect(wrongUses).toHaveLength(6);
  });
});
