import { markHiddenName } from "@halonicjs/std";
import type { ApprovalItem } from "../inbox-items.ts";

/**
 * The row and card title of a tool call waiting for an OK (INBOX-CARD-24):
 * "Sorter wants to use create_note (notes-mcp)", or "Sorter wants to use
 * publish" for one of Halonic's own tools. A subagent's call names the
 * subagent first: "Checker, for Sorter, wants to use publish". Never a name
 * made up from the tool's or the connector's own description. The MCP
 * server names the tool and the connector, so a hidden character in them
 * shows as its marker.
 *
 * @param agentName the agent's name as the workspace shows it; its id when its file can't be read
 * @param subagentName the subagent's name, likewise; `null` when the agent asked itself
 */
export function approvalTitle(
  item: ApprovalItem,
  agentName: string = item.agentName,
  subagentName: string | null = item.subagentName,
): string {
  const tool =
    item.connector === null
      ? markHiddenName(item.tool)
      : `${markHiddenName(item.tool)} (${markHiddenName(item.connector)})`;
  const asker =
    subagentName === null
      ? markHiddenName(agentName)
      : `${markHiddenName(subagentName)}, for ${markHiddenName(agentName)},`;
  return `${asker} wants to use ${tool}`;
}

/** The action's one-line summary (INBOX-CARD-23): "create_note · notes-mcp", or "publish". */
export function actionSummary(item: ApprovalItem): string {
  return item.connector === null
    ? markHiddenName(item.tool)
    : `${markHiddenName(item.tool)} · ${markHiddenName(item.connector)}`;
}
