import { verifies } from "@halonicjs/testing-spec";
import { describe, expect, it } from "vitest";
import { type ChatComponentName, chatLibrary } from "./components.ts";
import { promptFor } from "./prompt.ts";
import { readOpenUi } from "./reader.ts";

const all: ChatComponentName[] = ["card", "table", "form", "buttons"];

/** Reads one component inside the root and gives the root's children and the errors, as plain data. */
function read(component: string, names: ChatComponentName[] = all) {
  const result = readOpenUi(`root = Stack([${component}])`, chatLibrary(names));
  if (result.kind !== "tree") throw new Error(`expected a tree, got ${result.kind}`);
  const plain = JSON.parse(JSON.stringify(result));
  return { children: plain.root?.props.children ?? [], errors: plain.errors };
}

const codes = (errors: { code: string; path?: string }[]) =>
  errors.map((error) => [error.code, error.path ?? ""]);

verifies("openui-lang.components", () => {
  describe("card", () => {
    it("keeps a title, text, facts and links", () => {
      const { children, errors } = read(
        'Card("Order", "Shipped today.", [Fact("Total", "€90")], [Link("Track", "https://example.com/t")])',
      );
      expect(errors).toEqual([]);
      expect(children[0].props.facts[0].props).toEqual({ label: "Total", value: "€90" });
      expect(children[0].props.links[0].props.url).toBe("https://example.com/t");
    });

    it("keeps http and https links only, and leaves out and reports any other", () => {
      const refused = [
        "javascript:alert(1)",
        "file:///etc/hosts",
        "data:text/html,x",
        "/x",
        "http://",
        "https:///x",
        "https://a b.example",
      ];
      for (const url of refused) {
        const { children, errors } = read(`Card("t", "x", [], [Link("a", "${url}")])`);
        expect(children[0].props.links).toEqual([]);
        expect(codes(errors)).toContainEqual(["type-mismatch", "/url"]);
      }
      expect(read('Card("t", "x", [], [Link("a", "http://example.com")])').errors).toEqual([]);
    });

    it("leaves out a part from another component in its slots", () => {
      const { children, errors } = read('Card("t", "x", [Button("Go")])');
      expect(children[0].props.facts).toEqual([]);
      expect(codes(errors)).toEqual([["type-mismatch", "/facts/0"]]);
    });
  });

  describe("table", () => {
    it("keeps column names, rows of plain values and a caption", () => {
      const { children, errors } = read('Table(["Item", "Price"], [Row(["Tea", 3])], "Basket")');
      expect(errors).toEqual([]);
      expect(children[0].props).toMatchObject({ columns: ["Item", "Price"], caption: "Basket" });
      expect(children[0].props.rows[0].props.cells).toEqual(["Tea", 3]);
    });

    it("leaves out a component in a cell and reports it", () => {
      const { children, errors } = read('Table(["a"], [Row([Button("x"), "ok"])])');
      expect(children[0].props.rows[0].props.cells).toEqual(["ok"]);
      expect(codes(errors)).toEqual([["type-mismatch", "/cells/0"]]);
    });
  });

  describe("form", () => {
    it("keeps the five approved field kinds", () => {
      const fields = ["text", "longText", "list", "choice", "tickBox"]
        .map((kind) => `Field("${kind}", "${kind}", ["a"])`)
        .join(", ");
      const { children, errors } = read(`Form("Reply", [${fields}], "Draft the reply")`);
      expect(errors).toEqual([]);
      expect(children[0].props.fields).toHaveLength(5);
      expect(children[0].props.submit).toBe("Draft the reply");
    });

    it("refuses a password, file or date field", () => {
      for (const kind of ["password", "file", "date"]) {
        const { children, errors } = read(`Form("t", [Field("x", "${kind}")], "Send")`);
        expect(children[0].props.fields).toEqual([]);
        expect(codes(errors)).toContainEqual(["type-mismatch", "/kind"]);
      }
    });
  });

  describe("buttons", () => {
    it("keeps only a label: a variant, a colour or an icon is left out and reported", () => {
      const { children, errors } = read('Buttons([Button("Yes", "primary", "red", "check")])');
      expect(children[0].props.buttons[0].props).toEqual({ label: "Yes" });
      expect(codes(errors)).toEqual([["excess-args", ""]]);
    });

    it("leaves out an action: a button sends its own label", () => {
      const { children, errors } = read('Buttons([Button("Yes", @ToAssistant("other"))])');
      expect(children[0].props.buttons[0].props).toEqual({ label: "Yes" });
      expect(codes(errors)).toEqual([["excess-args", ""]]);
    });
  });

  describe("what is not on the list", () => {
    it("leaves out and reports an image or any other unknown component", () => {
      for (const component of ['Image("cat.png", "a cat")', "Chart([1, 2])", 'Text("x")']) {
        const { children, errors } = read(component);
        expect(children).toEqual([]);
        expect(codes(errors)).toEqual([["unknown-component", ""]]);
      }
    });

    it("leaves out a style or class argument and reports it", () => {
      const { children, errors } = read('Card("t", "x", [], [], {style: "color: red"}, "big")');
      expect(Object.keys(children[0].props)).toEqual(["title", "text", "facts", "links"]);
      expect(codes(errors)).toEqual([["excess-args", ""]]);
    });

    it("leaves out a component that is not switched on", () => {
      const { children, errors } = read('Buttons([Button("Yes")])', ["card"]);
      expect(children).toEqual([]);
      expect(codes(errors)).toEqual([["unknown-component", ""]]);
    });
  });

  describe("promptFor", () => {
    it("lists exactly the components asked for, with their arguments", () => {
      expect(promptFor(["card", "table"])).toMatchInlineSnapshot(`
        "You may draw parts of your reply with OpenUI Lang 1.1, display part only.
        Start with root = Stack([...]), holding only these components: Card, Table.
        Arguments go in the order shown; ? marks one you may leave out.
        There is no Query, Mutation, $state, expression or @ function.
        There are no styles, colours, icons or images; anything else is left out.

        - Card(title: string, text?: string, facts?: [Fact], links?: [Link]): A title, some text, short facts and links. title: the title; text: a few sentences; facts: Fact rows; links: Links.
          - Fact(label: string, value: string): A short label and value row. label: the label; value: the value.
          - Link(label: string, url: string): A link the user may open with a click. The user sees its real host. label: what it links to; url: an http or https address.
        - Table(columns: [value], rows: [Row], caption?: string): Rows of plain values under column names. columns: the column names; rows: Rows; caption: a line above the table.
          - Row(cells: [value]): One table row. cells: one text, number or true/false per column."
      `);
    });

    it("gives nothing when no component is switched on", () => {
      expect(promptFor([])).toBe("");
    });
  });
});
