import { describe, expect, it } from "vitest";
import { prepare } from "./parse-file.ts";
import { renameKey } from "./shared/legacy-keys.ts";

const fallback = { idFromPlace: "fallback" } as const;

describe("format.id-from-place", () => {
  it("fills in the id from the place when the file has none", () => {
    expect(prepare(fallback, { name: "Spare" }, "spare")).toEqual({ id: "spare", name: "Spare" });
  });

  it("keeps the file's own id over the place's", () => {
    expect(prepare(fallback, { id: "mock" }, "spare")).toEqual({ id: "mock" });
  });

  it("overrides the file's id when the place always gives it", () => {
    expect(prepare({ idFromPlace: "always" }, { id: "other" }, "notes")).toEqual({ id: "notes" });
  });

  it("ignores the place for kinds that have no id of their own", () => {
    expect(prepare({ idFromPlace: "none" }, { aliases: {} }, "models")).toEqual({ aliases: {} });
  });

  it("leaves the data as it is when no place is given", () => {
    expect(prepare(fallback, { name: "Spare" }, undefined)).toEqual({ name: "Spare" });
  });

  it("passes data that is no map to the schema unchanged", () => {
    expect(prepare(fallback, ["a"], "spare")).toEqual(["a"]);
    expect(prepare(fallback, null, "spare")).toBeNull();
  });
});

describe("format.legacy-keys", () => {
  const flowKind = {
    idFromPlace: "none",
    upgradeKeys: (data: Readonly<Record<string, unknown>>) => renameKey(data, "flow", "workflow"),
  } as const;

  it("reads the old key as the new one", () => {
    expect(prepare(flowKind, { flow: "invoice" }, undefined)).toEqual({ workflow: "invoice" });
  });

  it("keeps the old key when the new one is there too, so the schema names it", () => {
    const data = { flow: "a", workflow: "b" };
    expect(prepare(flowKind, data, undefined)).toEqual(data);
  });

  it("leaves a map without the old key as it is", () => {
    expect(renameKey({ id: "x" }, "flow", "workflow")).toEqual({ id: "x" });
  });

  it("keeps a __proto__ key as data", () => {
    const data = JSON.parse('{"__proto__": {"polluted": true}, "flow": "a"}');
    const renamed = renameKey(data, "flow", "workflow");
    expect(Object.hasOwn(renamed, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(renamed)).toBe(Object.prototype);
  });
});
