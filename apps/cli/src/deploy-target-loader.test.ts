import type { DeployTargetContext } from "@halonicjs/ports";
import { errorKindOf } from "@halonicjs/std";
import { FakeDeployTarget, fakeDeployTargetEntry } from "@halonicjs/testing-contracts";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { deployTargetPackage, loadDeployTarget } from "./deploy-target-loader.ts";
import { halonicVersion } from "./version.ts";

const context = {
  who: "sam@example.com",
  environmentToken: undefined,
} as unknown as DeployTargetContext;

function packages(modules: Record<string, unknown>) {
  const asked: string[] = [];
  const importPackage = async (name: string) => {
    asked.push(name);
    if (name in modules) return modules[name];
    throw Object.assign(new Error(`Cannot find package '${name}' imported from /cli/main.js`), {
      code: "ERR_MODULE_NOT_FOUND",
    });
  };
  return { asked, importPackage };
}

async function failureOf(promise: Promise<unknown>) {
  const error = await promise.then(
    () => undefined,
    (thrown: unknown) => thrown,
  );
  return {
    kind: errorKindOf(error),
    message: (error as Error).message,
    fix: (error as { fix?: string }).fix,
  };
}

verifies("cli.deploy-target-loader", () => {
  it("loads the target for a host by its package name and gives it the context", async () => {
    const target = new FakeDeployTarget();
    const entry = fakeDeployTargetEntry(target);
    const created: DeployTargetContext[] = [];
    const { asked, importPackage } = packages({
      "@halonicjs/target-fake-deploy": {
        deployTarget: {
          ...entry,
          create: (given: DeployTargetContext) => {
            created.push(given);
            return entry.create(given);
          },
        },
      },
    });

    expect(await loadDeployTarget("fake", context, importPackage)).toBe(target);
    expect(asked).toEqual(["@halonicjs/target-fake-deploy"]);
    expect(created).toEqual([context]);
    expect(deployTargetPackage("cloudflare")).toBe("@halonicjs/target-cloudflare-deploy");
  });

  it("says which package to install when the target isn't installed", async () => {
    const { importPackage } = packages({});

    expect(await failureOf(loadDeployTarget("cloudflare", context, importPackage))).toEqual({
      kind: "not_found",
      message:
        "Deploying to Cloudflare needs the package @halonicjs/target-cloudflare-deploy, and it isn't installed. Nothing changed on Cloudflare.",
      fix: "Install it next to halonic with npm install -g @halonicjs/target-cloudflare-deploy, then run again.",
    });
    const hyphenated = await failureOf(loadDeployTarget("foo-bar", context, importPackage));
    expect(hyphenated.message).toMatch(/^Deploying to Foo Bar needs the package /);
  });

  it("keeps the error of a package that is installed but can't load what it imports", async () => {
    const broken = Object.assign(
      new Error("Cannot find package 'left-pad' imported from /target/index.js"),
      {
        code: "ERR_MODULE_NOT_FOUND",
      },
    );
    const importPackage = async () => {
      throw broken;
    };

    await expect(loadDeployTarget("cloudflare", context, importPackage)).rejects.toBe(broken);
  });

  it("refuses a package without a deployTarget, for another host, of another port version or lacking a method", async () => {
    const entry = fakeDeployTargetEntry(new FakeDeployTarget());
    const cases: [unknown, string][] = [
      [{}, "it has no deployTarget export"],
      [{ deployTarget: { ...entry, host: "other" } }, "its target serves other, not fake"],
      [
        { deployTarget: { ...entry, version: 99 } },
        "it was built for deploy targets version 99, not 1",
      ],
      [
        { deployTarget: { ...entry, create: () => ({ plan() {}, deploy() {} }) } },
        "its target has no login, status, rollback, export, import, unlock, revokeSessions, destroy",
      ],
    ];
    for (const [module, reason] of cases) {
      const { importPackage } = packages({ "@halonicjs/target-fake-deploy": module });
      expect(await failureOf(loadDeployTarget("fake", context, importPackage))).toEqual({
        kind: "internal",
        message: `The installed @halonicjs/target-fake-deploy doesn't work with Halonic ${halonicVersion}: ${reason}.`,
        fix: `Install the @halonicjs/target-fake-deploy that matches Halonic ${halonicVersion}, then run again.`,
      });
    }
  });
});
