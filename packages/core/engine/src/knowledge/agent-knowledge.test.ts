import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { agentKnowledge, noKnowledge } from "./agent-knowledge.ts";
import { FakeSource, fakeKnowledge, sourceFile } from "./knowledge-test-kit.test-helper.ts";

verifies("engine.agent-knowledge", () => {
  it("builds the agent's sources through the factory of their type, in the agent's order", () => {
    const handbook = new FakeSource("handbook", []);
    const wiki = new FakeSource("wiki", []);
    const { options, built } = fakeKnowledge([handbook, wiki]);
    const known = {
      handbook: sourceFile("handbook"),
      wiki: sourceFile("wiki", { mode: "auto" }),
      unused: sourceFile("unused"),
    };

    const knowledge = agentKnowledge("acme", ["wiki", "handbook"], known, options);

    expect(knowledge.sources).toEqual([wiki, handbook]);
    expect(knowledge.auto).toEqual([wiki]);
    expect(built).toEqual([
      { id: "wiki", config: { name: "wiki" }, basePath: "hubs/acme" },
      { id: "handbook", config: { name: "handbook" }, basePath: "hubs/acme" },
    ]);
  });

  it("builds no source for an id the hub can't see, or for an agent without knowledge", () => {
    const { options, built } = fakeKnowledge([]);

    expect(agentKnowledge("acme", ["gone"], {}, options)).toEqual(noKnowledge);
    expect(agentKnowledge("acme", [], { wiki: sourceFile("wiki") }, options)).toEqual(noKnowledge);
    expect(built).toEqual([]);
  });

  it("fails naming the source and its type when no factory builds that type", () => {
    const { options } = fakeKnowledge([]);
    const known = { handbook: sourceFile("handbook", { provider: "vector" }) };

    expect(() => agentKnowledge("acme", ["handbook"], known, options)).toThrow(
      new Error(
        'The knowledge source "handbook" uses the provider "vector", which this engine has no factory for.',
      ),
    );
  });
});
