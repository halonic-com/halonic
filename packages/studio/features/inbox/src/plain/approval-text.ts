import type { ApprovalItem } from "../inbox-items.ts";
import { markedName } from "./hidden-characters.ts";

/**
 * The row and card title of a tool call waiting for an OK (INBOX-CARD-24):
 * "Sorter wants to use create_note (notes-mcp)", or "Sorter wants to use
 * publish" for one of Halonic's own tools. Never a name made up from the
 * tool's or the connector's own description. The MCP server names the tool
 * and the connector, so a hidden character in them shows as its marker.
 *
 * @param agentName the agent's name as the workspace shows it; its id until it's known
 */
export function approvalTitle(item: ApprovalItem, agentName: string = item.agent): string {
  const tool =
    item.connector === null
      ? markedName(item.tool)
      : `${markedName(item.tool)} (${markedName(item.connector)})`;
  return `${markedName(agentName)} wants to use ${tool}`;
}

/** The action's one-line summary (INBOX-CARD-23): "create_note · notes-mcp", or "publish". */
export function actionSummary(item: ApprovalItem): string {
  return item.connector === null
    ? markedName(item.tool)
    : `${markedName(item.tool)} · ${markedName(item.connector)}`;
}
