import type { ItemUsage } from "@halonicjs/app";
import { Button, Field } from "@halonicjs/studio-kit";
import type { ItemViewProps } from "@halonicjs/studio-shell";
import { Fragment } from "react";
import { sharedHubKey } from "./library-place.tsx";

interface UsedByFieldProps {
  readonly usage: ItemUsage | undefined;
  /** What the field says when no agent uses the item: it differs per kind. */
  readonly notUsed: string;
  readonly context: ItemViewProps["context"];
}

/** The "Used by" row of an item page: the agents that use it, each opening that agent's page. */
export function UsedByField({ usage, notUsed, context }: UsedByFieldProps) {
  return (
    <Field label="Used by" align="text">
      {usage === undefined || usage.agents.length === 0 ? (
        <p>{notUsed}</p>
      ) : (
        <p>
          {usage.agents.map((agent, index) => (
            <Fragment key={`${agent.hub ?? ""}/${agent.id}`}>
              {index === 0 ? null : " · "}
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  context.openItem?.({
                    kind: "agent",
                    hub: agent.hub ?? sharedHubKey,
                    id: agent.id,
                  })
                }
              >
                {agent.name}
              </Button>
            </Fragment>
          ))}
        </p>
      )}
    </Field>
  );
}
