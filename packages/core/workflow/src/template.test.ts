import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { getPath, render, renderText } from "./template.ts";

verifies("workflow.get-path", () => {
  it("reads a dotted path", () => {
    expect(getPath({ context: { user: { name: "Ada" } } }, "context.user.name")).toBe("Ada");
  });

  it("reads list items by index", () => {
    const scope = { tags: ["a", "b"] };
    expect(getPath(scope, "tags.0")).toBe("a");
    expect(getPath(scope, "tags.1")).toBe("b");
    expect(getPath(scope, "tags.2")).toBeUndefined();
    expect(getPath(scope, "tags.length")).toBe(2);
  });

  it("gives undefined once a part is missing", () => {
    expect(getPath({ context: {} }, "context.user.name")).toBeUndefined();
    expect(getPath({ context: { user: null } }, "context.user.name")).toBeUndefined();
    expect(getPath(undefined, "context")).toBeUndefined();
  });

  it("does not read into strings or numbers", () => {
    expect(getPath({ input: { name: "Ada" } }, "input.name.length")).toBeUndefined();
    expect(getPath({ input: { n: 3 } }, "input.n.toFixed")).toBeUndefined();
  });

  it("reads an empty path as the property with an empty name", () => {
    expect(getPath({ "": 5 }, "")).toBe(5);
    expect(getPath({ input: {} }, "")).toBeUndefined();
  });

  // The old code also read inherited properties; see
  // decisions/tomas/HAL-638-get-path-own-properties.md.
  it("does not read inherited properties", () => {
    expect(getPath({}, "constructor")).toBeUndefined();
    expect(getPath({}, "__proto__")).toBeUndefined();
    expect(getPath({ input: {} }, "input.toString")).toBeUndefined();
    expect(getPath({ tags: ["a"] }, "tags.map")).toBeUndefined();
  });

  it("reads an own property named __proto__", () => {
    const scope: unknown = JSON.parse('{ "__proto__": { "n": 1 } }');
    expect(getPath(scope, "__proto__.n")).toBe(1);
  });
});

verifies("workflow.render-template", () => {
  // Ported from "templates" › "keeps raw values for whole placeholders and
  // interpolates inside text" at 784f78d.
  it("keeps raw values for whole placeholders and interpolates inside text", () => {
    const scope = { input: { n: 3, name: "Ada" } };
    expect(render("{{input.n}}", scope)).toBe(3);
    expect(render("Hi {{input.name}}, {{input.n}}!", scope)).toBe("Hi Ada, 3!");
    expect(render("{{input.missing}}", scope)).toBeUndefined();
  });

  it("allows spaces inside the braces", () => {
    const scope = { input: { n: 3 } };
    expect(render("{{ input.n }}", scope)).toBe(3);
    expect(render("n = {{  input.n\t}}", scope)).toBe("n = 3");
  });

  it("keeps lists and objects for a whole placeholder", () => {
    const tags = ["a", "b"];
    expect(render("{{input.tags}}", { input: { tags } })).toBe(tags);
  });

  it("writes objects as JSON and leaves nothing for undefined and null inside a text", () => {
    const scope = { input: { o: { x: 1 }, list: [1, 2], yes: true, nothing: null } };
    expect(render("[{{input.o}}|{{input.nothing}}|{{input.missing}}]", scope)).toBe('[{"x":1}||]');
    expect(render("{{input.list}} {{input.yes}}", scope)).toBe("[1,2] true");
  });

  it("renders two placeholders side by side as text", () => {
    expect(render("{{input.n}}{{input.n}}", { input: { n: 3 } })).toBe("33");
  });

  it("leaves text that is not a placeholder as it is", () => {
    const scope = { input: { n: 3 } };
    expect(render("{{input n}}", scope)).toBe("{{input n}}");
    expect(render("{{}}", scope)).toBe("{{}}");
    expect(render("{input.n}", scope)).toBe("{input.n}");
  });

  it("gives nothing for an inherited property name", () => {
    const scope = { input: {} };
    expect(render("{{input.constructor}}", scope)).toBeUndefined();
    expect(render("x {{input.constructor}} {{__proto__}}", scope)).toBe("x  ");
  });

  it("returns values that are not strings unchanged", () => {
    const object = { a: "{{input.n}}" };
    expect(render(42, {})).toBe(42);
    expect(render(null, {})).toBeNull();
    expect(render(object, {})).toBe(object);
  });
});

verifies("workflow.render-text", () => {
  it("gives a whole placeholder's value as text", () => {
    expect(renderText("{{input.n}}", { input: { n: 3 } })).toBe("3");
    expect(renderText("{{input.o}}", { input: { o: { x: 1 } } })).toBe('{"x":1}');
  });

  it("gives empty text for a missing or null value", () => {
    expect(renderText("{{input.missing}}", { input: {} })).toBe("");
    expect(renderText("{{input.nothing}}", { input: { nothing: null } })).toBe("");
  });

  it("gives empty text for an inherited property name", () => {
    expect(renderText("{{constructor}}", {})).toBe("");
    expect(renderText("{{__proto__}}", {})).toBe("");
  });

  it("renders placeholders inside a text", () => {
    expect(renderText("Hi {{input.name}}", { input: { name: "Ada" } })).toBe("Hi Ada");
  });
});
