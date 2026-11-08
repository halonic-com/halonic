import { describe, expect, it } from "vitest";
import { prepare } from "./parse-file.ts";
import { renameKey } from "./shared/legacy-keys.ts";

const fallback = { idFromPlace: "fallback" } as const;

describe("format.id-from-place", () => {
  it("fills in the id from the place when the file has none", () => {
    expect(prepare(fallback, { name: "Spare" }, "spare").data).toEqual({
      id: "spare",
      name: "Spare",
    });
  });

  it("keeps the file's own id over the place's", () => {
    expect(prepare(fallback, { id: "mock" }, "spare").data).toEqual({ id: "mock" });
  });

  it("overrides the file's id when the place always gives it", () => {
    expect(prepare({ idFromPlace: "always" }, { id: "other" }, "notes").data).toEqual({
      id: "notes",
    });
  });

  it("ignores the place for kinds that have no id of their own", () => {
    expect(prepare({ idFromPlace: "none" }, { aliases: {} }, "models").data).toEqual({
      aliases: {},
    });
  });

  it("leaves the data as it is when no place is given", () => {
    expect(prepare(fallback, { name: "Spare" }, undefined).data).toEqual({ name: "Spare" });
  });

  it("says whether the id came from the place", () => {
    expect(prepare(fallback, {}, "spare").idFromPlace).toBe(true);
    expect(prepare(fallback, { id: "mock" }, "spare").idFromPlace).toBe(false);
  });

  it("passes data that is no map to the schema unchanged", () => {
    expect(prepare(fallback, ["a"], "spare").data).toEqual(["a"]);
    expect(prepare(fallback, null, "spare").data).toBeNull();
  });
});

describe("format.legacy-keys", () => {
  const flowKind = {
    idFromPlace: "none",
    upgradeKeys: (data: Readonly<Record<string, unknown>>) => renameKey(data, "flow", "workflow"),
  } as const;

  it("reads the old key as the new one", () => {
    expect(prepare(flowKind, { flow: "invoice" }, undefined).data).toEqual({ workflow: "invoice" });
  });

  it("keeps the old key when the new one is there too, so the schema names it", () => {
    const data = { flow: "a", workflow: "b" };
    expect(prepare(flowKind, data, undefined).data).toEqual(data);
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
