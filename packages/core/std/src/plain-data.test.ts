import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { describeObject, isPlainObject, keyPath } from "./plain-data.ts";

verifies("std.is-plain-object", () => {
  it("accepts objects made by {}, Object.create(null) and JSON.parse", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
    expect(isPlainObject(JSON.parse('{"a": 1}'))).toBe(true);
  });

  it("refuses arrays, dates, maps and class instances", () => {
    class Step {}
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date(0))).toBe(false);
    expect(isPlainObject(new Map())).toBe(false);
    expect(isPlainObject(new Step())).toBe(false);
  });

  it("refuses null and primitives", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
    expect(isPlainObject("x")).toBe(false);
    expect(isPlainObject(1)).toBe(false);
  });
});

verifies("std.describe-object", () => {
  it("names the class that made the object, with a or an", () => {
    class Step {}
    expect(describeObject(new Map())).toBe("a Map");
    expect(describeObject(new Step())).toBe("a Step");
    expect(describeObject(new Int8Array(1))).toBe("an Int8Array");
    expect(describeObject(new Uint8Array(1))).toBe("a Uint8Array");
  });

  it("says an instance of an unnamed class when the class has no name", () => {
    const Unnamed = (() => class {})();
    expect(describeObject(new Unnamed())).toBe("an instance of an unnamed class");
  });

  it("says a custom prototype when no class made the object", () => {
    expect(describeObject(Object.create({}))).toBe("an object with a custom prototype");
    expect(describeObject(Object.create(Object.create(null)))).toBe(
      "an object with a custom prototype",
    );
  });

  it("says a custom prototype when the prototype's constructor is not a function", () => {
    const proto = { constructor: "not a function" };
    expect(describeObject(Object.create(proto))).toBe("an object with a custom prototype");
  });

  it("says a plain object for plain objects", () => {
    expect(describeObject({})).toBe("a plain object");
    expect(describeObject(Object.create(null))).toBe("a plain object");
  });
});

verifies("std.key-path", () => {
  it("adds a key that is a simple identifier after a dot", () => {
    expect(keyPath("value", "steps")).toBe("value.steps");
    expect(keyPath("value[0]", "_id$2")).toBe("value[0]._id$2");
  });

  it("quotes any other key in brackets", () => {
    expect(keyPath("value", "a.b")).toBe('value["a.b"]');
    expect(keyPath("value", "0")).toBe('value["0"]');
    expect(keyPath("value", "")).toBe('value[""]');
    expect(keyPath("value", 'say "hi"')).toBe('value["say \\"hi\\""]');
  });

  it("keeps a dotted key apart from the same keys nested", () => {
    expect(keyPath("value", "a.b")).not.toBe(keyPath(keyPath("value", "a"), "b"));
  });
});
