import type { ToolScriptData } from "@halonicjs/ports";
import type { FakeToolScript, FakeToolScriptContext } from "./fake-tool-script-host.ts";

type Acme = Record<"getNote" | "setNote" | "wait" | "broken", (args: unknown) => Promise<unknown>>;
const acme = (ctx: FakeToolScriptContext) => ctx["acme"] as Acme;
const field = (ctx: FakeToolScriptContext, name: string) =>
  (ctx.input as Record<string, ToolScriptData>)[name];

/** The suite's scripts by name, written once for real isolates and once for the fake. */
export const contractScripts = {
  readWrite: [
    `export async function run(ctx) {
  const note = await ctx.acme.getNote({ name: "a" });
  await ctx.acme.setNote({ name: "b", text: note.text });
  ctx.log("copied");
  return note;
}`,
    async (ctx) => {
      const note = (await acme(ctx).getNote({ name: "a" })) as { text: string };
      await acme(ctx).setNote({ name: "b", text: note.text });
      ctx.log("copied");
      return note;
    },
  ],
  callWithInput: [
    `export async function run(ctx) {
  for (let i = 0; i < ctx.input.times; i += 1) await ctx.acme.getNote(ctx.input.args);
  return "done";
}`,
    async (ctx) => {
      for (let i = 0; i < Number(field(ctx, "times")); i += 1) {
        await acme(ctx).getNote(field(ctx, "args"));
      }
      return "done";
    },
  ],
  passFunction: [
    `export async function run(ctx) { await ctx.acme.getNote({ name: () => "a" }); return "sent"; }`,
    async (ctx) => {
      await acme(ctx).getNote({ name: () => "a" });
      return "sent";
    },
  ],
  throws: [
    `export async function run() { throw new Error("broken on purpose"); }`,
    async () => {
      throw new Error("broken on purpose");
    },
  ],
  fails: [
    `export async function run(ctx) { ctx.fail("nothing to copy"); }`,
    async (ctx) => ctx.fail("nothing to copy"),
  ],
  output: [
    `export async function run(ctx) { return ctx.input.function ? { run: () => 1 } : "x".repeat(ctx.input.size); }`,
    async (ctx) =>
      field(ctx, "function") === true ? { run: () => 1 } : "x".repeat(Number(field(ctx, "size"))),
  ],
  logs: [
    `export async function run(ctx) {
  for (let i = 0; i < ctx.input.lines; i += 1) ctx.log("y".repeat(ctx.input.length));
  return "logged";
}`,
    async (ctx) => {
      for (let i = 0; i < Number(field(ctx, "lines")); i += 1) {
        ctx.log("y".repeat(Number(field(ctx, "length"))));
      }
      return "logged";
    },
  ],
  waits: [
    `export async function run(ctx) { await ctx.acme.wait({}); return "waited"; }`,
    async (ctx) => {
      await acme(ctx).wait({});
      return "waited";
    },
  ],
  callsBroken: [
    `export async function run(ctx) { await ctx.acme.broken({}); return "unreachable"; }`,
    async (ctx) => {
      await acme(ctx).broken({});
      return "unreachable";
    },
  ],
} satisfies Record<string, [string, FakeToolScript]>;

/** The name of one of {@link contractScripts}. */
export type ScriptName = keyof typeof contractScripts;
