import { errorKindOf } from "@halonicjs/std";
import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { checkReply, ReplyChangedError, type ReplyIssue, type ReplySchema } from "./check-reply.ts";

// The kit has no Zod, so these stand-ins copy the public parts of Zod 4 that
// `checkReply` reads: `type`, an object's `shape`, an array's `element`, a
// record's `valueType` and a wrapper's `unwrap()`. Their issues are the ones
// Zod 4.6 gives for the same replies, `message` included, which may quote the
// value and must never be read.

const canary = "CANARY-a@example.com";

const leaf = (type: string) => ({ type });
const object = (shape: Record<string, unknown>) => ({ type: "object", shape });
const array = (element: unknown) => ({ type: "array", element });
const record = (valueType: unknown) => ({ type: "record", valueType });
const optional = (inner: unknown) => ({ type: "optional", unwrap: () => inner });

/** A stand-in schema whose `safeParse` fails with these issues. */
function failingWith(structure: object, issues: ReplyIssue[]): ReplySchema {
  return { ...structure, safeParse: () => ({ success: false, error: { issues } }) };
}

const orderReply = object({
  fulfillment: object({ status: leaf("string") }),
  items: array(object({ price: leaf("number") })),
  byCustomer: optional(record(object({ total: leaf("number") }))),
});

/** The error `checkReply` throws for a reply with these issues. */
function changed(issues: ReplyIssue[]): ReplyChangedError {
  try {
    checkReply(failingWith(orderReply, issues), {});
  } catch (error) {
    if (error instanceof ReplyChangedError) return error;
    throw error;
  }
  throw new Error("checkReply accepted the reply");
}

verifies("integration-kit.check-reply", () => {
  it("gives the parsed reply when it fits", () => {
    const schema: ReplySchema<{ id: string }> = {
      safeParse: () => ({ success: true, data: { id: "1001" } }),
    };
    expect(checkReply(schema, { id: "1001" })).toEqual({ id: "1001" });
  });

  it("names a missing field and the type it expected", () => {
    const error = changed([
      {
        expected: "object",
        code: "invalid_type",
        path: ["fulfillment"],
        message: "Invalid input: expected object, received undefined",
      } as ReplyIssue,
    ]);
    expect(error).toBeInstanceOf(ReplyChangedError);
    expect(errorKindOf(error)).toBe("unavailable");
    expect(error.failureCause).toEqual({
      code: "reply-changed",
      detail: { "field.1": "fulfillment", "expected.1": "object" },
    });
    expect(error.message).toBe("The service's reply changed: check fulfillment (object).");
  });

  it("gives a wrongly typed field's path and the expected type", () => {
    const error = changed([
      {
        expected: "number",
        code: "invalid_type",
        path: ["items", 0, "price"],
        message: `Invalid input: expected number, received string`,
      } as ReplyIssue,
    ]);
    expect(error.failureCause.detail).toEqual({
      "field.1": "items.0.price",
      "expected.1": "number",
    });
  });

  it("names a malformed field by its format, and each field once", () => {
    const error = changed([
      { code: "invalid_format", format: "date-time", path: ["fulfillment", "status"] },
      { code: "too_small", path: ["fulfillment", "status"] },
    ]);
    expect(error.failureCause.detail).toEqual({
      "field.1": "fulfillment.status",
      "expected.1": "date-time",
    });
  });

  describe("never names the reply's content", () => {
    it("leaves out a key only the reply has", () => {
      const error = changed([
        {
          code: "unrecognized_keys",
          keys: [canary],
          path: [],
          message: `Unrecognized key: "${canary}"`,
        } as ReplyIssue,
      ]);
      expect(error.message).toBe("The service's reply changed.");
      expect(error.failureCause.detail).toEqual({});
    });

    it("masks a record's key and keeps the schema's fields around it", () => {
      const error = changed([
        {
          expected: "number",
          code: "invalid_type",
          path: ["byCustomer", canary, "total"],
          message: "Invalid input: expected number, received string",
        } as ReplyIssue,
      ]);
      expect(error.failureCause.detail).toEqual({
        "field.1": "byCustomer.{…}.total",
        "expected.1": "number",
      });
    });

    it("masks a path segment the schema doesn't name", () => {
      const error = changed([{ code: "custom", path: [canary, Symbol(canary)] }]);
      expect(error.failureCause.detail).toEqual({ "field.1": "{…}.{…}", "expected.1": "custom" });
    });

    it("never repeats a canary value from the reply", () => {
      const error = changed([
        {
          expected: "string",
          code: "invalid_type",
          path: ["fulfillment", "status"],
          message: `Invalid input: expected string, received ${canary}`,
          input: canary,
        } as ReplyIssue,
        {
          code: "invalid_value",
          values: ["open", "closed"],
          path: ["items", 3, "price"],
          message: `Invalid option: got ${canary}`,
        } as ReplyIssue,
      ]);
      expect(JSON.stringify(error.failureCause)).not.toContain("CANARY");
      expect(error.message).not.toContain("CANARY");
      expect(error.failureCause.detail).toEqual({
        "field.1": "fulfillment.status",
        "expected.1": "string",
        "field.2": "items.3.price",
        "expected.2": "invalid_value",
      });
    });
  });

  it("cuts more than 4 fields to the 8 entries a failure note carries", () => {
    const missing = Array.from({ length: 10 }, (_, index) => `field${index + 1}`);
    const wide = object(Object.fromEntries(missing.map((name) => [name, leaf("string")])));
    const issues = missing.map((name) => ({
      expected: "string",
      code: "invalid_type",
      path: [name],
    }));
    let thrown: unknown;
    try {
      checkReply(failingWith(wide, issues), {});
    } catch (error) {
      thrown = error;
    }
    const { detail } = (thrown as ReplyChangedError).failureCause;
    expect(Object.keys(detail)).toHaveLength(8);
    expect(detail["field.4"]).toBe("field4");
    expect(detail).not.toHaveProperty("field.5");
    expect((thrown as ReplyChangedError).message).toMatch(/, and 6 more\.$/);
  });

  it("shortens a long path to 64 characters, and names the reply as a whole", () => {
    const long = "a".repeat(100);
    const deep = object({ [long]: leaf("string") });
    let thrown: unknown;
    try {
      checkReply(
        failingWith(deep, [
          { expected: "string", code: "invalid_type", path: [long] },
          { expected: "object", code: "invalid_type", path: [] },
        ]),
        null,
      );
    } catch (error) {
      thrown = error;
    }
    expect((thrown as ReplyChangedError).failureCause.detail).toEqual({
      "field.1": "a".repeat(64),
      "expected.1": "string",
      "field.2": "(reply)",
      "expected.2": "object",
    });
  });
});
