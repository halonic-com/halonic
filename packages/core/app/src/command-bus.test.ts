import { describe, expect, it } from "vitest";
import { CommandBus, CommandError, type CommandSpec } from "./command-bus.ts";

interface TestCommands {
  greet: CommandSpec<string, string>;
  save: CommandSpec<void, number>;
}

describe("app.command-bus", () => {
  it("runs a command through its handler and returns the result", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("greet", (name) => `Hello ${name}`);
    expect(await bus.execute("greet", "Ada")).toBe("Hello Ada");
  });

  it("waits for a handler that answers later", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("save", async () => 3);
    expect(await bus.execute("save", undefined)).toBe(3);
  });

  it("lets a command without input leave the input out", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("save", () => 3);
    expect(await bus.execute("save")).toBe(3);
  });

  it("rejects a command without a handler", async () => {
    const bus = new CommandBus<TestCommands>();
    expect(bus.has("save")).toBe(false);
    await expect(bus.execute("save", undefined)).rejects.toThrow(CommandError);
  });

  it("refuses a second handler and keeps the first", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("greet", (name) => `Hello ${name}`);
    expect(() => bus.register("greet", () => "other")).toThrow(CommandError);
    expect(await bus.execute("greet", "Ada")).toBe("Hello Ada");
  });

  it("passes on the error of a failing handler", async () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("save", () => {
      throw new Error("disk full");
    });
    await expect(bus.execute("save", undefined)).rejects.toThrow("disk full");
  });

  it("removes a handler, and an old remove function leaves a newer handler alone", async () => {
    const bus = new CommandBus<TestCommands>();
    const remove = bus.register("greet", () => "first");
    remove();
    await expect(bus.execute("greet", "Ada")).rejects.toThrow(CommandError);
    bus.register("greet", () => "second");
    remove();
    expect(await bus.execute("greet", "Ada")).toBe("second");
  });

  it("drops every handler on close and refuses new ones", () => {
    const bus = new CommandBus<TestCommands>();
    bus.register("greet", () => "hi");
    bus.close();
    expect(bus.has("greet")).toBe(false);
    expect(() => bus.register("save", () => 1)).toThrow(CommandError);
    expect(bus.has("save")).toBe(false);
  });
});
