import type { ConnectorTool, ToolRisk } from "@halonicjs/ports";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { listedTool } from "../testing/scripted-model.ts";
import { type DeclaredTools, offerListedTools } from "./offer-listed-tools.ts";

verifies("engine.turn-declared-tools", () => {
  function riskOf(listed: ToolRisk | undefined, declared: DeclaredTools | undefined) {
    const tool: ConnectorTool = {
      ...listedTool("send_email"),
      ...(listed ? { risk: listed } : {}),
    };
    const { tools } = offerListedTools({
      source: "mail",
      listed: [tool],
      otherNames: new Set(),
      lists: { approve: [], read: ["send_email"] },
      ...(declared === undefined ? {} : { declared }),
    });
    return tools[0];
  }

  it("counts a tool the sheet declares as send as sending, whatever the listing says", () => {
    expect(riskOf(undefined, { send_email: { risk: "send" } })).toMatchObject({
      risk: "send",
      listedRisk: "send",
    });
    expect(riskOf("write", { send_email: { risk: "send" } })?.risk).toBe("send");
  });

  it("lets the listing raise the sheet's risk but never lower it", () => {
    expect(riskOf("send", { send_email: { risk: "read" } })?.risk).toBe("send");
    expect(riskOf("send", { send_email: { risk: "write" } })?.listedRisk).toBe("send");
  });

  it("counts a tool the read list marks as write when the sheet declares it as write", () => {
    const tool = riskOf(undefined, { send_email: { risk: "write" } });

    expect(tool?.risk).toBe("write");
    expect(tool).not.toHaveProperty("markedRead");
  });

  it("changes nothing for a tool the sheet doesn't declare", () => {
    expect(riskOf(undefined, undefined)).toMatchObject({ risk: "read", markedRead: true });
    expect(riskOf(undefined, { other: { risk: "send" } })).toMatchObject({ risk: "read" });
  });

  it("doesn't read an inherited property of the map as a declaration", () => {
    const { tools } = offerListedTools({
      source: "mail",
      listed: [listedTool("constructor")],
      otherNames: new Set(),
      declared: {},
    });

    expect(tools[0]).toMatchObject({ risk: "write" });
    expect(tools[0]).not.toHaveProperty("noun");
  });
});
