import { describe, expect, it } from "vitest";
import { CommandError, type CommandSpec } from "./command-bus.ts";
import { serviceKey } from "./service-registry.ts";
import { type AppCommands, type AppEvents, WorkspaceScope } from "./workspace-scope.ts";

interface TestCommands extends AppCommands {
  greet: CommandSpec<string, string>;
}

function openScope(location = "memory:demo", reported: unknown[] = []) {
  return new WorkspaceScope<TestCommands, AppEvents>({
    location,
    onListenerError: (error) => reported.push(error),
  });
}

describe("app.workspace-scope", () => {
  it("gives each open workspace its own commands, events and services", async () => {
    const first = openScope("memory:a");
    const second = openScope("memory:b");
    first.commands.register("greet", (name) => `Hello ${name}`);
    first.services.provide(serviceKey("log"), []);
    expect(second.commands.has("greet")).toBe(false);
    expect(second.services.has(serviceKey("log"))).toBe(false);
    await expect(second.commands.execute("greet", "Ada")).rejects.toThrow(CommandError);
  });

  it("sends workspace.closing, disposes services and drops handlers on close", async () => {
    const scope = openScope();
    const seen: string[] = [];
    scope.events.on("workspace.closing", ({ location }) => seen.push(`closing ${location}`));
    scope.services.provide(serviceKey("timer"), { dispose: () => void seen.push("disposed") });
    scope.commands.register("greet", () => "hi");
    expect(scope.closed).toBe(false);
    await scope.close();
    expect(scope.closed).toBe(true);
    expect(seen).toEqual(["closing memory:demo", "disposed"]);
    await expect(scope.commands.execute("greet", "Ada")).rejects.toThrow(CommandError);
    expect(() => scope.commands.register("greet", () => "late")).toThrow(CommandError);
    expect(() => scope.services.provide(serviceKey("late"), {})).toThrow();
  });

  it("closes once, however often close is called", async () => {
    const scope = openScope();
    let closing = 0;
    let disposed = 0;
    scope.events.on("workspace.closing", () => closing++);
    scope.services.provide(serviceKey("timer"), { dispose: () => void disposed++ });
    await Promise.all([scope.close(), scope.close()]);
    await scope.close();
    expect([closing, disposed]).toEqual([1, 1]);
  });

  it("reports a closing listener that throws and still disposes services", async () => {
    const reported: unknown[] = [];
    const scope = openScope("memory:demo", reported);
    let disposed = false;
    scope.events.on("workspace.closing", () => {
      throw new Error("listener failed");
    });
    scope.services.provide(serviceKey("timer"), {
      dispose: () => {
        disposed = true;
      },
    });
    await scope.close();
    expect(disposed).toBe(true);
    expect(reported).toEqual([new Error("listener failed")]);
  });
});
