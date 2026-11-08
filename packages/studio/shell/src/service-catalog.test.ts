import { describe, expect, it } from "vitest";
import { defineFeature, type Studio } from "./index.ts";
import { serviceKey } from "./service-key.ts";
import { createShell } from "./shell.ts";
import { ShellError } from "./shell-error.ts";
import { MapTarget } from "./test-support/map-target.ts";

const workspaceKey = serviceKey<{ root: string }>("workspace");
const agentsKey = serviceKey<{ names(): string[] }>("agents");
const routinesKey = serviceKey<{ agentCount(): number }>("routines");

const agents = defineFeature({
  id: "agents",
  title: "Agents",
  needs: [workspaceKey],
  provides: [agentsKey],
  register(studio) {
    studio.services.provide(agentsKey, (services) => {
      const root = services.get(workspaceKey).root;
      return { names: () => [`${root}/reviewer`, `${root}/writer`] };
    });
  },
});

const routines = defineFeature({
  id: "routines",
  title: "Routines",
  needs: [agentsKey],
  provides: [routinesKey],
  register(studio) {
    studio.services.provide(routinesKey, (services) => {
      const agentsService = services.get(agentsKey);
      return { agentCount: () => agentsService.names().length };
    });
  },
});

function workspace(): MapTarget {
  const target = new MapTarget();
  target.provide(workspaceKey, { root: "acme" });
  return target;
}

describe("shell.feature-services", () => {
  it("builds services in dependency order for each workspace", () => {
    const shell = createShell({ features: [routines, agents], hostServices: [workspaceKey] });
    const first = workspace();
    shell.services.instantiate(first);
    expect(first.provided).toEqual(["workspace", "agents", "routines"]);
    expect(first.get(routinesKey).agentCount()).toBe(2);

    const second = workspace();
    shell.services.instantiate(second);
    expect(second.get(agentsKey)).not.toBe(first.get(agentsKey));
  });

  it("builds a feature's own services in the order they need each other", () => {
    const helperKey = serviceKey<{ greeting: string }>("helper");
    const mainKey = serviceKey<{ greet(): string }>("main");
    const both = defineFeature({
      id: "both",
      title: "Both",
      provides: [mainKey, helperKey],
      register(studio) {
        studio.services.provide(mainKey, (services) => {
          const helper = services.get(helperKey);
          return { greet: () => helper.greeting };
        });
        studio.services.provide(helperKey, () => ({ greeting: "hello" }));
      },
    });
    const target = workspace();
    createShell({ features: [both] }).services.instantiate(target);
    expect(target.provided).toEqual(["workspace", "helper", "main"]);
    expect(target.get(mainKey).greet()).toBe("hello");
  });

  it("refuses a feature whose own services need each other in a cycle", () => {
    const firstKey = serviceKey<{ n: number }>("first");
    const secondKey = serviceKey<{ n: number }>("second");
    const looping = defineFeature({
      id: "looping",
      title: "Looping",
      provides: [firstKey, secondKey],
      register(studio) {
        studio.services.provide(firstKey, (services) => ({ n: services.get(secondKey).n }));
        studio.services.provide(secondKey, (services) => ({ n: services.get(firstKey).n }));
      },
    });
    const shell = createShell({ features: [looping] });
    expect(() => shell.services.instantiate(new MapTarget())).toThrow(
      'The feature "looping" has services that need each other: "first" -> "second" -> "first".',
    );
  });

  it("refuses a lookup the feature didn't declare in needs", () => {
    const sneaky = defineFeature({
      id: "sneaky",
      title: "Sneaky",
      provides: [routinesKey],
      register(studio) {
        studio.services.provide(routinesKey, (services) => ({
          agentCount: () => services.get(workspaceKey).root.length,
        }));
      },
    });
    const shell = createShell({ features: [sneaky], hostServices: [workspaceKey] });
    const target = workspace();
    shell.services.instantiate(target);
    expect(() => target.get(routinesKey).agentCount()).toThrow(
      'The feature "sneaky" asked for the service "workspace" but doesn\'t list it in needs.',
    );
  });

  it("refuses a service not listed in provides, provided twice, or left out", () => {
    const unlisted = defineFeature({
      id: "unlisted",
      title: "Unlisted",
      register: (studio) => studio.services.provide(agentsKey, () => ({ names: () => [] })),
    });
    expect(() => createShell({ features: [unlisted] })).toThrow("doesn't list it in provides");

    const twice = defineFeature({
      id: "twice",
      title: "Twice",
      provides: [agentsKey],
      register(studio) {
        studio.services.provide(agentsKey, () => ({ names: () => [] }));
        studio.services.provide(agentsKey, () => ({ names: () => [] }));
      },
    });
    expect(() => createShell({ features: [twice] })).toThrow('provides "agents" twice');

    const forgetful = defineFeature({
      id: "forgetful",
      title: "Forgetful",
      provides: [agentsKey],
      register: () => {},
    });
    expect(() => createShell({ features: [forgetful] })).toThrow(
      "never calls studio.services.provide",
    );
  });

  it("refuses to provide after register returned", () => {
    let kept: Studio | undefined;
    const late = defineFeature({
      id: "late",
      title: "Late",
      register: (studio) => {
        kept = studio;
      },
    });
    createShell({ features: [late] });
    expect(() => kept?.services.provide(agentsKey, () => ({ names: () => [] }))).toThrow(
      ShellError,
    );
  });

  it("refuses to build when a host service is missing", () => {
    const shell = createShell({ features: [agents], hostServices: [workspaceKey] });
    expect(() => shell.services.instantiate(new MapTarget())).toThrow(
      'The host service "workspace" is missing from this workspace.',
    );
  });
});
