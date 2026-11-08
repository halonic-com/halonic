import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { MemoryDefinitionStore } from "./definition-store.ts";

verifies("memory.definition-store", () => {
  it("starts with the files it is given, at memory:workspace", async () => {
    const store = new MemoryDefinitionStore({ "hubs/a/hub.yaml": "id: a\n" });
    expect(store.location).toBe("memory:workspace");
    expect(await store.read("hubs/a/hub.yaml")).toBe("id: a\n");
    expect(new MemoryDefinitionStore({}, "memory:demo").location).toBe("memory:demo");
  });

  it("refuses an unsafe path among the starting files", () => {
    expect(() => new MemoryDefinitionStore({ "../x.yaml": "x" })).toThrow(RangeError);
  });

  it("may start with private entries, but never serves or lists them", async () => {
    const store = new MemoryDefinitionStore({ ".env": "A=1", "a.yaml": "1" });
    expect(await store.list()).toEqual(["a.yaml"]);
    await expect(store.read(".env")).rejects.toThrow(RangeError);
    expect(store.snapshot()).toEqual({ ".env": "A=1", "a.yaml": "1" });
  });

  it("gives a version of sha256: and 16 hex characters that depends only on the files", async () => {
    const a = new MemoryDefinitionStore({ "a.yaml": "1", "b.yaml": "2" });
    const b = new MemoryDefinitionStore({ "b.yaml": "2", "a.yaml": "1" });
    expect(await a.version()).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(await a.version()).toBe(await b.version());
  });

  it("returns a copy of every file in a snapshot", async () => {
    const store = new MemoryDefinitionStore({ "a.yaml": "1" });
    const snapshot = store.snapshot();
    snapshot["b.yaml"] = "2";
    expect(snapshot).toEqual({ "a.yaml": "1", "b.yaml": "2" });
    expect(await store.list()).toEqual(["a.yaml"]);
  });
});
