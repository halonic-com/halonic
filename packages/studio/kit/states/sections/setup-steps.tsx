import { type SetupStep, SetupSteps } from "../../src/setup-steps/setup-steps.tsx";
import type { PartSection } from "../state-table.tsx";

const noAction = () => undefined;

type StepId = "model" | "agent" | "run";

const agent: SetupStep<StepId> = {
  id: "agent",
  title: "Make your first agent",
  hint: "Give it a name and say what it should do.",
  done: false,
  label: "Step 2 of 3: Make your first agent, not done",
};

const run: SetupStep<StepId> = {
  id: "run",
  title: "Run it once",
  hint: "See what it does, step by step.",
  done: false,
  label: "Step 3 of 3: Run it once, not done",
};

const ollama = <code className="font-mono">localhost:11434</code>;

/** Step 1, Connect a model, with its check in the given state. */
function model(check: SetupStep["check"], done = false): SetupStep<StepId> {
  return {
    id: "model",
    title: "Connect a model",
    hint: "Start Ollama, or add a key for a cloud model.",
    done,
    label: `Step 1 of 3: Connect a model, ${done ? "done" : "not done"}`,
    ...(check === undefined ? {} : { check }),
  };
}

/** Get set up's three steps, as on Home in the user's own workspace. */
function GetSetUp({ first }: { readonly first: SetupStep<StepId> }) {
  return (
    <div className="w-[30rem] phone:w-full">
      <SetupSteps label="Get set up" steps={[first, agent, run]} onOpen={noAction} />
    </div>
  );
}

export const setupStepsSection: PartSection = {
  id: "setup-steps",
  number: "15.9",
  name: "SetupSteps",
  order:
    "HAL-477 2.2, first-run-progress 3.1 · Get set up's three steps; the state is on step 1 · checking counts from 3 s",
  notApplicable:
    "disabled (a step never locks another), error (a problem is amber: nothing has run yet)",
  rows: [
    { name: "To do", copies: () => <GetSetUp first={model(undefined)} /> },
    {
      name: "Checking",
      copies: () => (
        <GetSetUp
          first={model({
            state: "checking",
            what: <>Checking Ollama at {ollama}…</>,
            since: new Date(Date.now() - 3_000),
          })}
        />
      ),
    },
    {
      name: "Problem",
      copies: () => (
        <GetSetUp
          first={model({
            state: "problem",
            cause: (
              <>
                Ollama isn't answering at {ollama}. Start Ollama, or add an API key for a cloud
                model.
              </>
            ),
            actions: [
              { label: "Check again", onClick: noAction },
              { label: "Open Models", onClick: noAction },
              { label: "Something wrong?", onClick: noAction },
            ],
          })}
        />
      ),
    },
    {
      name: "Focus, an action",
      force: "focus",
      target: "tr:first-child button:first-of-type",
      copies: () => (
        <GetSetUp
          first={model({
            state: "problem",
            cause: "Ollama isn't answering at localhost:11434.",
            actions: [
              { label: "Check again", onClick: noAction },
              { label: "Open Models", onClick: noAction },
            ],
          })}
        />
      ),
    },
    { name: "Done", copies: () => <GetSetUp first={model(undefined, true)} /> },
  ],
};
