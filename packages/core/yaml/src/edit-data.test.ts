import { unwrap } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { applyEditToData, checkValue, describePath, type YamlEdit } from "./edit-data.ts";

const problem = (data: unknown, edit: YamlEdit) => {
  const result = applyEditToData(data, edit);
  if (result.ok) throw new Error("expected a problem");
  return result.error;
};
const set = (path: YamlEdit["path"], value: unknown): YamlEdit => ({ kind: "set", path, value });
const del = (path: YamlEdit["path"]): YamlEdit => ({ kind: "delete", path });
const insert = (path: YamlEdit["path"], value: unknown): YamlEdit => ({
  kind: "insert",
  path,
  value,
});

verifies("yaml.edit", () => {
  describe("describePath", () => {
    it("names the top of the file and dotted paths", () => {
      expect(describePath([])).toBe("the top of the file");
      expect(describePath(["steps", 0, "id"])).toBe('"steps.0.id"');
    });
  });

  describe("set", () => {
    it("explains a missing list, an item past the end and one past the end", () => {
      expect(problem({}, set(["a", 0], 1))).toBe(
        'There is no list at "a"; set creates only maps. Set the list first.',
      );
      expect(problem({ a: {} }, set(["a", "b", 0], 1))).toBe(
        'There is no list at "a.b"; set creates only maps. Set the list first.',
      );
      expect(problem({ l: [1, 2] }, set(["l", 2], 9))).toBe(
        '"l.2" is one past the end of the list; use insert to add an item.',
      );
      expect(problem({ l: [1, 2] }, set(["l", 3], 9))).toBe(
        'There is no item 3 in "l"; the list has 2.',
      );
    });

    it("replaces the last item of a list", () => {
      expect(unwrap(applyEditToData({ l: [1, 2] }, set(["l", 1], 9)))).toEqual({ l: [1, 9] });
    });

    it("passes on a problem found at the root, on the way, or at the end", () => {
      expect(problem(null, set([0], 1))).toBe(
        "There is no list at the top of the file; set creates only maps. Set the list first.",
      );
      expect(problem(5, set(["a"], 1))).toBe(
        "the top of the file holds a number, not a map or a list.",
      );
      expect(problem({ a: 5 }, set(["a", "b", "c"], 1))).toBe(
        '"a" holds a number, not a map or a list.',
      );
      expect(problem({ a: [1] }, set(["a", 4, "c"], 1))).toBe(
        'There is no item 4 in "a"; the list has 1.',
      );
      expect(problem({ a: [] }, set(["a", "x", "c"], 1))).toBe(
        '"a" is a list; use a number, not "x", to reach an item.',
      );
    });

    it("creates the missing maps on the way and puts the key in the map", () => {
      expect(unwrap(applyEditToData(undefined, set(["a", "b"], 1)))).toEqual({ a: { b: 1 } });
      expect(unwrap(applyEditToData({ a: null }, set(["a", "b"], 1)))).toEqual({ a: { b: 1 } });
      expect(unwrap(applyEditToData({ x: 1 }, set(["a", "b"], 1)))).toEqual({ x: 1, a: { b: 1 } });
    });

    it("sets a key named __proto__ as an own key that can be changed again", () => {
      const once = unwrap(applyEditToData({}, set(["__proto__"], 1))) as Record<string, unknown>;
      expect(Object.hasOwn(once, "__proto__")).toBe(true);
      expect(Object.getPrototypeOf(once)).toBe(Object.prototype);
      const twice = unwrap(applyEditToData(once, set(["__proto__"], 2))) as Record<string, unknown>;
      expect(Object.getOwnPropertyDescriptor(twice, "__proto__")).toEqual({
        value: 2,
        writable: true,
        enumerable: true,
        configurable: true,
      });
      const nested = unwrap(applyEditToData({}, set(["__proto__", "a"], 1))) as Record<
        string,
        unknown
      >;
      expect(Object.getOwnPropertyDescriptor(nested, "__proto__")).toMatchObject({
        writable: true,
        configurable: true,
      });
    });

    it("does not change its input", () => {
      const data = { a: { b: 1 } };
      applyEditToData(data, set(["a", "c"], 2));
      expect(data).toEqual({ a: { b: 1 } });
    });
  });

  describe("delete", () => {
    it("explains what it cannot walk through", () => {
      expect(problem({ a: 1 }, del([]))).toBe(
        "delete needs a path; to empty the file, set [] to {}.",
      );
      expect(problem({ a: 5 }, del(["a", "b", "c"]))).toBe(
        '"a" holds a number, not a map or a list.',
      );
      expect(problem({ a: [1] }, del(["a", "x", "c"]))).toBe(
        '"a" is a list; use a number, not "x", to reach an item.',
      );
      expect(problem({ a: 5 }, del(["a", "b"]))).toBe('"a" holds a number, not a map or a list.');
      expect(problem({ a: [1] }, del(["a", "x"]))).toBe(
        '"a" is a list; use a number, not "x", to reach an item.',
      );
    });

    it("does nothing when nothing is there", () => {
      expect(unwrap(applyEditToData({ a: 1 }, del(["b"])))).toEqual({ a: 1 });
      expect(unwrap(applyEditToData({ a: 1 }, del(["b", "c"])))).toEqual({ a: 1 });
      expect(unwrap(applyEditToData({ a: null }, del(["a", "c"])))).toEqual({ a: null });
      expect(unwrap(applyEditToData({ a: [1] }, del(["a", 5, "c"])))).toEqual({ a: [1] });
      expect(unwrap(applyEditToData(null, del(["a", "c"])))).toBe(null);
    });

    it("removes a key without touching a same-named inherited property", () => {
      expect(unwrap(applyEditToData({ a: 1, b: 2 }, del(["a"])))).toEqual({ b: 2 });
      const data = { a: 1 };
      expect(unwrap(applyEditToData(data, del(["toString"])))).toEqual({ a: 1 });
      expect(unwrap(applyEditToData({ l: [1, 2, 3] }, del(["l", 1])))).toEqual({ l: [1, 3] });
    });
  });

  describe("insert", () => {
    it("explains what it cannot insert into", () => {
      expect(problem([], insert(["a"], 1))).toBe("insert needs a path that ends in a list index.");
      expect(problem({ a: {} }, insert(["a", 0], 1))).toBe(
        'There is no list at "a" to insert into.',
      );
      expect(problem({ a: { b: {} } }, insert(["a", "b", 0], 1))).toBe(
        'There is no list at "a.b" to insert into.',
      );
      expect(problem({ a: [1] }, insert(["a", 3], 1))).toBe(
        'There is no item 3 in "a"; the list has 1.',
      );
      expect(problem({ a: 5 }, insert(["a", "b", 0], 1))).toBe(
        '"a" holds a number, not a map or a list.',
      );
      expect(problem({ a: [1] }, insert(["a", 4, 0], 1))).toBe(
        'There is no item 4 in "a"; the list has 1.',
      );
    });

    it("adds at the start, the middle and the end", () => {
      expect(unwrap(applyEditToData({ l: [1, 2] }, insert(["l", 2], 3)))).toEqual({ l: [1, 2, 3] });
      expect(unwrap(applyEditToData({ l: [1, 2] }, insert(["l", 0], 0)))).toEqual({ l: [0, 1, 2] });
    });
  });

  describe("paths", () => {
    it("refuses an index that is not a whole number of 0 or more", () => {
      for (const bad of [-1, 1.5, Number.NaN]) {
        expect(problem([], set([bad], 1))).toBe(
          `A list index must be a whole number of 0 or more, not ${bad}.`,
        );
      }
      expect(unwrap(applyEditToData([1], set([0], 2)))).toEqual([2]);
    });

    it("refuses a key that is neither text nor a number", () => {
      expect(problem({}, set([true as unknown as string], 1))).toBe(
        "A path holds only text keys and list indexes, not boolean.",
      );
    });
  });

  describe("checkValue", () => {
    it("accepts plain data", () => {
      expect(checkValue({ a: [1, "x", true, null, { b: 2 }] }, 10)).toBeUndefined();
      expect(checkValue(Object.assign(Object.create(null), { a: 1 }), 10)).toBeUndefined();
    });

    it("names the value and where it is", () => {
      expect(checkValue(undefined, 10)).toBe("The value is undefined, which YAML can't hold.");
      expect(checkValue({ a: [1, undefined] }, 10)).toBe(
        'The value at "a.1" is undefined, which YAML can\'t hold.',
      );
      expect(checkValue({ a: () => 1 }, 10)).toBe(
        'The value at "a" is a function, which YAML can\'t hold.',
      );
      expect(checkValue(1n, 10)).toBe("The value is a bigint, which YAML can't hold.");
      expect(checkValue({ a: Symbol("s") }, 10)).toBe(
        'The value at "a" is a symbol, which YAML can\'t hold.',
      );
    });

    it("names the kind of object", () => {
      expect(checkValue(new Date(0), 10)).toBe(
        "The value is a Date; YAML holds only plain objects and arrays.",
      );
      expect(checkValue({ m: new Map() }, 10)).toBe(
        'The value at "m" is a Map; YAML holds only plain objects and arrays.',
      );
      class Thing {}
      expect(checkValue(new Thing(), 10)).toBe(
        "The value is a Thing; YAML holds only plain objects and arrays.",
      );
    });

    it("names an object without a constructor name", () => {
      const odd = Object.create({ constructor: undefined });
      expect(checkValue(odd, 10)).toBe(
        "The value is an object; YAML holds only plain objects and arrays.",
      );
    });

    it("finds a value that contains itself, but not one that is shared", () => {
      const loop: Record<string, unknown> = {};
      loop["self"] = loop;
      expect(checkValue(loop, 10)).toBe(
        'The value at "self" contains itself, which YAML can\'t hold.',
      );
      const shared = { x: 1 };
      expect(checkValue({ a: shared, b: shared }, 10)).toBeUndefined();
    });

    it("stops at the depth limit, and only past it", () => {
      expect(checkValue({ a: { b: 1 } }, 2)).toBeUndefined();
      expect(checkValue({ a: { b: {} } }, 2)).toBe(
        'The value at "a.b" nests deeper than the limit of 2 levels.',
      );
      expect(checkValue({ a: 1 }, 0)).toBe("The value nests deeper than the limit of 0 levels.");
    });
  });
});
