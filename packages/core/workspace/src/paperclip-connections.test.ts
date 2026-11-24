import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { readPaperclipConnections } from "./index.ts";
import { MemorySource } from "./test/memory-source.ts";

/** A connection file's text. */
function connectionFile(label: string, address: string, company: string): string {
  return `label: ${label}\naddress: ${address}\ncompany: ${company}\n`;
}

const halonic = connectionFile("Halonic", "https://paperclip.example.com", "halonic-company");
const acme = connectionFile("Acme", "https://paperclip.acme.example", "acme-company");

verifies("workspace.paperclip-connection", () => {
  it("reads a connection named by its file name", async () => {
    const source = new MemorySource({ "connections/paperclip/halonic.yaml": halonic });
    expect(await readPaperclipConnections(source)).toEqual({
      connections: [
        {
          name: "halonic",
          path: "connections/paperclip/halonic.yaml",
          connection: {
            label: "Halonic",
            address: "https://paperclip.example.com",
            company: "halonic-company",
          },
        },
      ],
      issues: [],
    });
  });

  it("lists two connections by name", async () => {
    const source = new MemorySource({
      "workspace.yaml": "id: acme\nname: Acme\n",
      "connections/paperclip/halonic.yaml": halonic,
      "connections/paperclip/acme.yaml": acme,
      "connections/paperclip/README.md": "Notes\n",
      "connections/paperclip/old/halonic.yaml": halonic,
    });
    const { connections, issues } = await readPaperclipConnections(source);
    expect(connections.map((each) => [each.name, each.connection.label])).toEqual([
      ["acme", "Acme"],
      ["halonic", "Halonic"],
    ]);
    expect(issues).toEqual([]);
  });

  it("refuses a file with a key and keeps the others", async () => {
    const source = new MemorySource({
      "connections/paperclip/acme.yaml": acme,
      "connections/paperclip/halonic.yaml": `${halonic}key: pcp_acme\n`,
    });
    const { connections, issues } = await readPaperclipConnections(source);
    expect(connections.map((each) => each.name)).toEqual(["acme"]);
    expect(issues.map((issue) => [issue.file, issue.code, issue.line])).toEqual([
      ["connections/paperclip/halonic.yaml", "unrecognized_keys", 4],
    ]);
    expect(issues[0]?.message).toContain('"key" can\'t be in it');
    expect(issues[0]?.message).toContain("keychain");
  });

  it("refuses an http address to another computer", async () => {
    const source = new MemorySource({
      "connections/paperclip/halonic.yaml": connectionFile(
        "Halonic",
        "http://paperclip.example.com",
        "halonic-company",
      ),
    });
    const { connections, issues } = await readPaperclipConnections(source);
    expect(connections).toEqual([]);
    expect(issues.map((issue) => [issue.file, issue.code, issue.line])).toEqual([
      ["connections/paperclip/halonic.yaml", "paperclip-address", 2],
    ]);
  });

  it("refuses a second file for the same address and company, naming the first", async () => {
    const source = new MemorySource({
      "connections/paperclip/halonic.yaml": halonic,
      "connections/paperclip/work.yaml": connectionFile(
        "Work",
        "https://Paperclip.example.com/",
        "halonic-company",
      ),
    });
    const { connections, issues } = await readPaperclipConnections(source);
    expect(connections.map((each) => each.name)).toEqual(["halonic"]);
    expect(issues).toEqual([
      {
        severity: "error",
        source: "check",
        code: "duplicate-paperclip-connection",
        path: [],
        message:
          "This file connects to the same Paperclip address and company as connections/paperclip/halonic.yaml. Keep one of the two files.",
        file: "connections/paperclip/work.yaml",
        line: 1,
        col: 1,
      },
    ]);
  });

  it("keeps two companies on the same server apart", async () => {
    const source = new MemorySource({
      "connections/paperclip/halonic.yaml": halonic,
      "connections/paperclip/side.yaml": connectionFile(
        "Side",
        "https://paperclip.example.com",
        "side-company",
      ),
    });
    const { connections } = await readPaperclipConnections(source);
    expect(connections.map((each) => each.name)).toEqual(["halonic", "side"]);
  });

  it("skips a file removed between list and read", async () => {
    const source = new MemorySource({}, ["connections/paperclip/gone.yaml"]);
    expect(await readPaperclipConnections(source)).toEqual({ connections: [], issues: [] });
  });
});
