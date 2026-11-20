import { CommandBox, usePresentation } from "@halonicjs/studio-kit";
import { listedToolsWords } from "../listed-tools-words.ts";

/** Props for {@link ListedToolsElsewhere}. */
export interface ListedToolsElsewhereProps {
  /** The connector's id, as `halonic tools review` takes it. */
  readonly connectorId: string;
}

/**
 * What a connector's page says in place of the waiting line for an MCP server over HTTP, whose
 * tools Studio can't list yet (microcopy 11.4): the sentence, then the `halonic tools review`
 * command in a box. It has no **Try again**, since trying again can't help (rule N6, HAL-12363).
 */
export function ListedToolsElsewhere({ connectorId }: ListedToolsElsewhereProps) {
  const where = usePresentation() === "phone" ? "computer" : "terminal";
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-body [overflow-wrap:anywhere]">{listedToolsWords.cantList(where)}</p>
      <CommandBox command={listedToolsWords.reviewCommand(connectorId)} />
    </div>
  );
}
