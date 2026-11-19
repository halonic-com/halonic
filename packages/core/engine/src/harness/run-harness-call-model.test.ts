import { verifies } from "@halonicjs/testing-spec";
import { expect, it } from "vitest";
import { runCallOn, writerCall } from "./harness-call-test-kit.test-helper.ts";
import type { HarnessModelNames } from "./harness-host.ts";
import { finished, harnessPorts, stillOpen } from "./harness-test-kit.test-helper.ts";

/** Model names that know one alias, `open-coder-agent`, in hub `acme`, and note what they're asked. */
function namesWithOneAlias(asked: string[][] = []): HarnessModelNames {
  return {
    providerModelOf: async (hubId, name) => {
      asked.push([hubId, name]);
      return hubId === "acme" && name === "open-coder-agent" ? "glm-5.2" : undefined;
    },
  };
}

/** The writer's call, with its file naming `model`. */
function callWith(model: string | undefined) {
  const { model: _written, ...agent } = writerCall.agent;
  return { ...writerCall, agent: model === undefined ? agent : { ...agent, model } };
}

/** Runs the writer's call with `models`, and gives the task the harness was started with. */
async function taskOf(models: HarnessModelNames | undefined, model: string | undefined) {
  const ports = harnessPorts();
  ports.harness.events = [finished("ok")];
  ports.options = { ...ports.options, ...(models === undefined ? {} : { models }) };
  const ran = await runCallOn(ports, undefined, undefined, undefined, callWith(model));
  return { ...ran, ports, task: ports.harness.tasks[0] };
}

verifies("engine.harness-model-alias", () => {
  it("asks the program for the alias's provider model id, for every call", async () => {
    const asked: string[][] = [];

    const { task } = await taskOf(namesWithOneAlias(asked), "open-coder-agent");

    expect(task?.model).toBe("glm-5.2");
    expect(task?.modelForEveryCall).toBe(true);
    expect(asked).toEqual([["acme", "open-coder-agent"]]);
  });

  it("gives the harness's environment the same model, before the sandbox opens", async () => {
    const { ports } = await taskOf(namesWithOneAlias(), "open-coder-agent");

    expect(ports.harness.environmentModels).toEqual([
      { model: "glm-5.2", modelForEveryCall: true },
    ]);
  });

  it("passes a name that is no alias on as written", async () => {
    const { task } = await taskOf(namesWithOneAlias(), "sonnet");

    expect(task?.model).toBe("sonnet");
    expect(task).not.toHaveProperty("modelForEveryCall");
  });

  it("passes every name on as written when the host gives no model names", async () => {
    const { task } = await taskOf(undefined, "open-coder-agent");

    expect(task?.model).toBe("open-coder-agent");
    expect(task).not.toHaveProperty("modelForEveryCall");
  });

  it("names no model and asks nothing when the agent's file names none", async () => {
    const asked: string[][] = [];

    const { task } = await taskOf(namesWithOneAlias(asked), undefined);

    expect(task).not.toHaveProperty("model");
    expect(task).not.toHaveProperty("modelForEveryCall");
    expect(asked).toEqual([]);
  });

  it("fails the call before anything opens when the model names can't be read", async () => {
    const unreadable: HarnessModelNames = {
      providerModelOf: async () => {
        throw new Error("models.yaml couldn't be read.");
      },
    };

    const { error, ports } = await taskOf(unreadable, "open-coder-agent");

    expect(error).toEqual(new Error("models.yaml couldn't be read."));
    expect(ports.harness.tasks).toEqual([]);
    expect(stillOpen(ports.steps)).toBe(0);
  });
});
