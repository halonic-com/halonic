import type { WorkspaceIssue } from "../load-workspace.ts";
import { maxRuleFileBytes, ruleFilePath, ruleStepsOf } from "../rule-files.ts";
import type { CheckContext } from "./check-context.ts";

/**
 * The rule file each rule step names is in the workflow's hub and within
 * {@link maxRuleFileBytes} (`workspace.rule-files`). A run doesn't keep a
 * file that fails this, so its rule step would fail with `rule.missing`.
 */
export function checkRuleFiles(context: CheckContext): WorkspaceIssue[] {
  const issues: WorkspaceIssue[] = [];
  for (const workflow of context.filesOf("workflow")) {
    for (const step of ruleStepsOf(workflow.value)) {
      const path = ruleFilePath(workflow.hub, step.rule);
      const file = context.ruleFile(path);
      const at = ["states", step.state, "rule"];
      if (file === undefined) {
        const message = `Step "${step.state}" names the rule file "${step.rule}", which isn't at ${path}.`;
        issues.push(context.error(workflow.path, at, "rule-file-missing", message));
      } else if (file.kind === "too-large") {
        const message = `The rule file "${step.rule}" of step "${step.state}" is ${file.bytes} bytes; a rule file may have at most ${maxRuleFileBytes}.`;
        issues.push(context.error(workflow.path, at, "rule-file-too-large", message));
      }
    }
  }
  return issues;
}
