import { verifies } from "@halonicjs/testing-spec";
import { expect } from "vitest";
import { fenceIt } from "./fence-case.ts";
import { type MakeToolScriptIsolate, recorder, runScript, script } from "./harness.ts";

/** Arguments that aren't plain data, each built by a line of script. */
const notPlain: readonly (readonly [string, string])[] = [
  ["a getter", `({ get x() { ctx.log("getter ran"); return 1; } })`],
  ["a toJSON method", `({ toJSON() { ctx.log("toJSON ran"); return 1; } })`],
  ["a valueOf method", `({ valueOf() { ctx.log("valueOf ran"); return 1; } })`],
  [
    "a Symbol.toPrimitive method",
    `({ [Symbol.toPrimitive]() { ctx.log("toPrimitive ran"); return 1; } })`,
  ],
  ["a class instance", `new (class Acme { constructor() { this.x = 1; } })()`],
  ["a function", `() => 1`],
  ["a symbol", `Symbol("acme")`],
  ["a symbol key", `({ [Symbol("acme")]: 1 })`],
  ["NaN", `NaN`],
  ["Infinity", `({ n: Infinity })`],
  ["undefined in an object", `({ n: undefined })`],
  ["a sparse array", `[1, , 3]`],
  ["an array with an extra key", `Object.assign([1, 2], { extra: 3 })`],
  ["a hidden key", `Object.defineProperty({}, "hidden", { value: 1, enumerable: false })`],
  ["a Date", `new Date(0)`],
  ["a Map", `new Map([["a", 1]])`],
  ["a cycle", `(() => { const a = {}; a.self = a; return a; })()`],
  ["two arguments", `1, 2`],
];

/** A value nested `depth` levels deep, as script text. */
function nested(depth: number): string {
  return `${"[".repeat(depth)}1${"]".repeat(depth)}`;
}

async function callWith(make: MakeToolScriptIsolate, argument: string) {
  const acme = recorder();
  const code = script(`await ctx.acme.ping(${argument}); return "called";`);
  const result = await runScript(make, code, { functions: { acme: { ping: acme.fn } } });
  return { result, calls: acme.calls };
}

/** S15: a host function gets a frozen plain-data copy and no script code runs while it is made. */
export function argumentCases(make: MakeToolScriptIsolate): void {
  verifies("toolscript-fence.plain-arguments", () => {
    refusalCases(make);
    copyCases(make);
    protoKeyCases(make);
    sizeCases(make);
  });
}

/** Every argument that isn't plain data is refused, and none of its code runs. */
function refusalCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  for (const [label, argument] of notPlain) {
    it(`refuses ${label} without running any of the script's code`, async () => {
      const { result, calls } = await callWith(make, argument);
      expect(result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
      expect(result.log).toEqual([]);
      expect(calls).toEqual([]);
    });
  }
}

/** What the host gets is a frozen copy, made without the script's prototype tricks. */
function copyCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("gives the host a frozen copy of plain data", async () => {
    const { result, calls } = await callWith(
      make,
      `{ name: "acme", tags: ["a", "b"], nested: { n: 1.5, ok: true, none: null } }`,
    );
    expect(result.ok && result.output).toBe("called");
    expect(calls).toEqual([
      { name: "acme", tags: ["a", "b"], nested: { n: 1.5, ok: true, none: null } },
    ]);
    const [copy] = calls as [{ tags: unknown; nested: unknown }];
    expect([
      Object.isFrozen(copy),
      Object.isFrozen(copy.tags),
      Object.isFrozen(copy.nested),
    ]).toEqual([true, true, true]);
  });

  it("never runs a toJSON or a descriptor getter the script put on Object.prototype", async () => {
    const acme = recorder();
    const code = script(`
      Object.prototype.toJSON = function () { ctx.log("toJSON ran"); return "swapped"; };
      for (const key of ["value", "get", "set", "writable", "enumerable", "configurable", "length", "0"]) {
        Object.defineProperty(Object.prototype, key, { __proto__: null, get() { ctx.log(key + " getter ran"); return undefined; } });
      }
      await ctx.acme.ping({ name: "acme", tags: ["a"] });
      return "called";`);
    const result = await runScript(make, code, { functions: { acme: { ping: acme.fn } } });
    expect(result.ok && result.output).toBe("called");
    expect(result.log).toEqual([]);
    expect(acme.calls).toEqual([{ name: "acme", tags: ["a"] }]);
  });
}

/** The depth, item and byte limits of one argument. */
function sizeCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  it("takes 8 levels and refuses 9", async () => {
    expect((await callWith(make, nested(8))).result.ok).toBe(true);
    const nine = await callWith(make, nested(9));
    expect(nine.result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
  });

  it("takes 100 items and refuses 101", async () => {
    expect((await callWith(make, "Array.from({ length: 100 }, (_, i) => i)")).result.ok).toBe(true);
    const over = await callWith(make, "Array.from({ length: 101 }, (_, i) => i)");
    expect(over.result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
  });

  it("takes 8,192 bytes of JSON and refuses 8,193", async () => {
    // A string of n characters is n + 2 bytes of JSON.
    expect((await callWith(make, `"a".repeat(8190)`)).result.ok).toBe(true);
    const over = await callWith(make, `"a".repeat(8191)`);
    expect(over.result).toMatchObject({ ok: false, reason: "toolscript.bad-argument" });
  });
}

/** An own `__proto__` key reaches the host as a plain key, in an argument and in the output. */
function protoKeyCases(make: MakeToolScriptIsolate): void {
  const it = fenceIt(make);
  const forms = [
    `JSON.parse('{"__proto__": {"admin": true}}')`,
    `({ ["__proto__"]: { admin: true } })`,
  ];

  it("keeps an own __proto__ key in an argument a plain key", async () => {
    for (const form of forms) {
      const { result, calls } = await callWith(make, form);
      expect(result.ok, form).toBe(true);
      const [copy] = calls as [Record<string, unknown>];
      expect(Object.getPrototypeOf(copy)).toBe(Object.prototype);
      expect(copy["admin"]).toBeUndefined();
      expect(Object.keys(copy)).toEqual(["__proto__"]);
    }
  });

  it("keeps an own __proto__ key in the output a plain key", async () => {
    for (const form of forms) {
      const result = await runScript(make, script(`return ${form};`));
      expect(result.ok, form).toBe(true);
      const output = (result.ok ? result.output : {}) as Record<string, unknown>;
      expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
      expect(output["admin"]).toBeUndefined();
      expect(Object.keys(output)).toEqual(["__proto__"]);
    }
  });
}
