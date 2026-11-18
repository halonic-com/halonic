import { CommandBox } from "@halonicjs/studio-kit";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import type { WorkflowConfiguration } from "../../src/api.ts";
import { Configuration } from "../../src/configuration/configuration-page.tsx";
import type { ConfigurationPage } from "../../src/configuration/configuration-pages.ts";

/**
 * A workflow's Configuration with made-up settings (HAL-12800), opened on the page in `?page=`
 * (`general` or `tests`). The Tests page here is a stand-in with the command to copy, the line that
 * broke inside its words in a 390 px window; its made-up folder is as long as the one in the UX check.
 */
const configuration: WorkflowConfiguration = {
  hubId: "acme",
  id: "support-reply",
  name: "Support reply",
  description: "Answers a customer's question by email",
  initial: "read",
  stepIds: ["read", "draft", "review"],
  file: "hubs/acme/workflows/support-reply.workflow.yaml",
  problems: [
    {
      severity: "error",
      code: "dead-end",
      message: "Step review has no transitions and is not final.",
      stepId: "review",
    },
  ],
};

const tests = (
  <div className="flex flex-col items-start gap-2 text-small text-fg-muted">
    <p>Studio can't run tests yet. To run them, run this in a terminal:</p>
    <CommandBox command='halonic test --dir "/acme/sam/Documents/Acme sample" --filter support-reply' />
  </div>
);

const page = new URLSearchParams(location.search).get("page") === "tests" ? "tests" : "general";
const root = document.getElementById("root");
if (root !== null) {
  root.className = "flex h-screen flex-col";
  createRoot(root).render(
    <StrictMode>
      <Configuration
        name={configuration.name}
        load={{ kind: "ready", value: configuration }}
        retry={() => undefined}
        startOn={page satisfies ConfigurationPage}
        tests={tests}
        onOpenStep={() => undefined}
      />
    </StrictMode>,
  );
}
