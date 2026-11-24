import type { IndexedHubs } from "@halonicjs/adapter-cloudflare-storage";

/**
 * The `acme` hub as the deployer's run-definitions index has it: a workflow whose first step asks
 * the `writer` agent's model, which only a timer, so the run object's alarm, sets off.
 */
export const acmeDefinitions = {
  acme: {
    hubId: "acme",
    workflows: {
      "handle-order": {
        version: 1,
        id: "handle-order",
        name: "Handle an order",
        initial: "reply",
        context: {},
        states: {
          reply: {
            type: "task",
            agent: "writer",
            input: "Reply to the customer",
            output: "reply",
            on: [{ to: "done", event: "done" }],
          },
          done: { type: "final", on: [] },
        },
        layout: {},
      },
    },
    agents: {
      writer: {
        version: 1,
        id: "writer",
        name: "Writer",
        params: {},
        instructions: "",
        skills: [],
        knowledge: [],
        connectors: [],
        runLogs: false,
        collections: [],
        subagents: [],
        methods: {},
        output: { type: "text" },
        maxSteps: 6,
      },
    },
    collections: {},
    knowledge: {},
    skills: {},
    connectors: {},
  },
} as unknown as IndexedHubs;
