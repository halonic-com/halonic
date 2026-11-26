import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { parsedValue, problemsOf, yaml } from "../../test/parse.spec.ts";
import { connectorIsLocal } from "./is-local.ts";

const paperclip = (connection: string) =>
  yaml("id: paperclip", "transport:", "  paperclip:", `    connection: ${connection}`);

verifies("format.connector-paperclip", () => {
  it("reads a Paperclip connector that names one of the workspace's connections", () => {
    expect(parsedValue("connector", paperclip("halonic")).transport).toEqual({
      paperclip: { connection: "halonic" },
    });
  });

  it("refuses a connection name a connection file can't have, and any field but the name", () => {
    expect(problemsOf("connector", paperclip("../keys"))).not.toEqual([]);
    expect(problemsOf("connector", paperclip("-halonic"))).not.toEqual([]);
    const withKey = yaml(
      "id: paperclip",
      "transport:",
      "  paperclip: { connection: halonic, key: pcp_board_x }",
    );
    expect(problemsOf("connector", withKey)).not.toEqual([]);
  });

  it("is never local without local: true", () => {
    const connector = parsedValue("connector", paperclip("halonic"));
    expect(connectorIsLocal(connector)).toBe(false);
    expect(connectorIsLocal({ ...connector, local: true })).toBe(true);
  });
});
