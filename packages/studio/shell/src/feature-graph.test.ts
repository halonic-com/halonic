import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { defineFeature, type Feature } from "./feature.ts";
import { serviceKey } from "./service-key.ts";
import { createShell } from "./shell.ts";
import { ShellError } from "./shell-error.ts";

const agentsKey = serviceKey<{ list(): string[] }>("agents");
const routinesKey = serviceKey<{ count(): number }>("routines");
const workspaceKey = serviceKey<{ root: string }>("workspace");

function stub(
  id: string,
  options: { needs?: Feature["needs"]; provides?: Feature["provides"] },
  log: string[],
): Feature {
  return defineFeature({
    id,
    title: id,
    ...options,
    register(studio) {
      log.push(id);
      for (const key of options.provides ?? []) {
        studio.services.provide(key, () => ({}));
      }
    },
  });
}

verifies("shell.feature-registry", () => {
  it("registers a feature after the features whose services it needs", () => {
    const log: string[] = [];
    const routines = stub("routines", { needs: [agentsKey] }, log);
    const agents = stub("agents", { needs: [workspaceKey], provides: [agentsKey] }, log);
    const shell = createShell({ features: [routines, agents], hostServices: [workspaceKey] });
    expect(log).toEqual(["agents", "routines"]);
    expect(shell.features.map((feature) => feature.id)).toEqual(["agents", "routines"]);
  });

  it("keeps the given order when features don't depend on each other", () => {
    const log: string[] = [];
    createShell({ features: [stub("b", {}, log), stub("a", {}, log), stub("c", {}, log)] });
    expect(log).toEqual(["b", "a", "c"]);
  });

  it("refuses two features with the same id and registers none", () => {
    const log: string[] = [];
    const create = () =>
      createShell({ features: [stub("agents", {}, log), stub("agents", {}, log)] });
    expect(create).toThrow(ShellError);
    expect(create).toThrow('Two features have the id "agents"');
    expect(log).toEqual([]);
  });

  it("refuses a needed service nobody provides", () => {
    const create = () => createShell({ features: [stub("routines", { needs: [agentsKey] }, [])] });
    expect(create).toThrow(
      'The feature "routines" needs the service "agents", but nothing provides it.',
    );
  });

  it("refuses a service with two providers, the app included", () => {
    const twoFeatures = () =>
      createShell({
        features: [
          stub("agents", { provides: [agentsKey] }, []),
          stub("agents-copy", { provides: [agentsKey] }, []),
        ],
      });
    expect(twoFeatures).toThrow(
      'provided by both the feature "agents" and the feature "agents-copy"',
    );
    const appAndFeature = () =>
      createShell({
        features: [stub("agents", { provides: [agentsKey] }, [])],
        hostServices: [agentsKey],
      });
    expect(appAndFeature).toThrow(
      'provided by both the app (hostServices) and the feature "agents"',
    );
  });

  it("refuses features that need each other in a cycle", () => {
    const a = stub("a", { needs: [routinesKey], provides: [agentsKey] }, []);
    const b = stub("b", { needs: [agentsKey], provides: [routinesKey] }, []);
    expect(() => createShell({ features: [a, b] })).toThrow("in a cycle: a → b → a");
  });

  it("checks feature ids and repeated keys when a feature is defined", () => {
    const define = (id: string) => defineFeature({ id, title: id, register: () => {} });
    expect(() => define("Agents")).toThrow(ShellError);
    expect(() => define("run--history")).toThrow(ShellError);
    expect(define("run-history").id).toBe("run-history");
    expect(() =>
      defineFeature({ id: "x", title: "X", needs: [agentsKey, agentsKey], register: () => {} }),
    ).toThrow('lists the service "agents" twice in needs');
  });

  it("names the feature whose register failed", () => {
    const broken = defineFeature({
      id: "broken",
      title: "Broken",
      register: () => {
        throw new Error("boom");
      },
    });
    expect(() => createShell({ features: [broken] })).toThrow(
      'The feature "broken" failed to register: boom',
    );
  });
});
