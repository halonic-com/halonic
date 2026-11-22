import type { DialogHostProps, WorkspaceContext } from "@halonicjs/studio-shell";
import { useSyncExternalStore } from "react";
import { CheckComputerSourceService } from "../api.ts";
import { CheckComputerOpenerService } from "../check-computer-opener.ts";
import type { CheckFact } from "../check-facts.ts";
import { CheckComputerDialog } from "./check-computer-dialog.tsx";
import type { ActionHandlers } from "./check-list.tsx";

// The Workspace feature's commands, by id, as other features run them (`workspace.workspace-page`).
const openTrustCommand = "workspace.open-trust";
const openModelsCommand = "workspace.open-models";

/**
 * What the lines' buttons do from this window: each closes the dialog first, because it is modal,
 * then opens the place that fixes the line. It never fixes anything itself (4.4). **Test again**,
 * **Continue** and **Start over…** come with their own pull request, so their buttons don't show yet.
 */
function lineHandlers(context: WorkspaceContext, close: () => void): ActionHandlers {
  const { runCommand, openItem } = context;
  const command = (id: string) => () => {
    close();
    runCommand?.(id);
  };
  return {
    ...(runCommand === undefined
      ? {}
      : {
          "review-trust": command(openTrustCommand),
          "open-models": command(openModelsCommand),
          "pick-model": command(openModelsCommand),
        }),
    ...(openItem === undefined
      ? {}
      : {
          "open-run": (fact: CheckFact) => {
            if (fact.check !== "last-run" || fact.hub === undefined) return;
            close();
            openItem({ kind: "run", hub: fact.hub, id: fact.runId });
          },
        }),
  };
}

/**
 * Draws Check this computer while it is open, and nothing otherwise
 * (requirement `check-computer.dialog`). The window draws it once; the dialog is modal, so where
 * it sits doesn't matter. Without the app's source, as in the browser demo, it draws nothing.
 */
export function CheckComputerHost({ context }: DialogHostProps) {
  const opener = context.services.get(CheckComputerOpenerService);
  const source = context.services.find(CheckComputerSourceService);
  const opening = useSyncExternalStore(opener.subscribe, opener.current);
  if (opening === undefined || source === undefined) return null;
  const close = () => opener.close();
  return (
    <CheckComputerDialog
      key={opening}
      source={source}
      handlers={lineHandlers(context, close)}
      onClose={close}
    />
  );
}
