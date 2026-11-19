import type { ModelsFiles } from "@halonicjs/studio-feature-models/api";
import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { DefaultModelWatch, defaultProviderOf, isTestModelProvider } from "./test-model-watch.ts";

const onMock = "version: 1\naliases:\n  default:\n    provider: mock\n    model: echo\n";
const onAnthropic =
  "version: 1\naliases:\n  default:\n    provider: anthropic\n    model: claude-haiku-4-5\n";

/** The demo's Models files: `models.yaml` as given, the test model and Anthropic as providers. */
function filesOf(models: string | null) {
  const files = { models };
  let changed = () => {};
  const providers: Record<string, string> = {
    "providers/mock.yaml": "version: 1\ntype: mock\n",
    "providers/anthropic.yaml": "version: 1\ntype: anthropic\n",
  };
  const modelsFiles = {
    readModels: async () => files.models,
    readProvider: async (path: string) => providers[path] ?? null,
    subscribe: (listener: () => void) => {
      changed = listener;
      return () => {
        changed = () => {};
      };
    },
  } as Partial<ModelsFiles> as ModelsFiles;
  const change = (text: string) => {
    files.models = text;
    changed();
  };
  return { modelsFiles, change };
}

/** Resolves when the watch next says something new. */
function nextChange(watch: DefaultModelWatch): Promise<void> {
  return new Promise((resolve) => {
    const stop = watch.subscribe(() => {
      stop();
      resolve();
    });
  });
}

verifies("studio.try-sample", () => {
  it("reads the provider the default alias names, and none without one", () => {
    expect(defaultProviderOf(onMock)).toBe("mock");
    expect(
      defaultProviderOf("version: 1\naliases:\n  fast:\n    provider: mock\n"),
    ).toBeUndefined();
    expect(defaultProviderOf(null)).toBeUndefined();
    expect(defaultProviderOf("aliases: [")).toBeUndefined();
  });

  it("knows the test model by its provider type, not its name", () => {
    expect(isTestModelProvider("version: 1\ntype: mock\nname: Scripted\n")).toBe(true);
    expect(isTestModelProvider("version: 1\ntype: ollama\n")).toBe(false);
    expect(isTestModelProvider(null)).toBe(false);
  });

  it("says the demo is on the test model, then not once default names a real model", async () => {
    const { modelsFiles, change } = filesOf(onMock);
    const watch = new DefaultModelWatch(modelsFiles);

    await nextChange(watch);
    expect(watch.onTestModel).toBe(true);
    change(onAnthropic);

    await nextChange(watch);
    expect(watch.onTestModel).toBe(false);
    watch.dispose();
  });

  it("says no once models.yaml can't be read", async () => {
    const { modelsFiles, change } = filesOf(onMock);
    const watch = new DefaultModelWatch(modelsFiles);
    await nextChange(watch);
    modelsFiles.readModels = async () => {
      throw new Error("permission denied");
    };

    change(onMock);

    await nextChange(watch);
    expect(watch.onTestModel).toBe(false);
    watch.dispose();
  });
});
