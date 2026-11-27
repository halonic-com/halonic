import { useEffect, useState } from "react";
import type { AgentRef, AgentRoutine, AgentsHost, AgentUser } from "../api.ts";
import { pageWords } from "./page-words.ts";

/**
 * The places that use the agent, as the rename line names them (flow-agents 3.1): each workflow
 * step that runs it, named as its card on the canvas names it, then each routine that starts it.
 */
export function renamePlaces(
  users: readonly AgentUser[],
  routines: readonly AgentRoutine[],
): readonly string[] {
  const steps = users.flatMap((user) =>
    (user.stepNames ?? user.stepIds).map((step) => pageWords.placeStep(user.name, step)),
  );
  return [...steps, ...routines.map((routine) => pageWords.placeRoutine(routine.name))];
}

/**
 * The places a rename of the agent also updates, for the line under its name field; read again
 * when a file changes. The line is a help, so when the workflows or routines can't be read it
 * names none, and the rename still works.
 */
export function useRenamePlaces(host: AgentsHost, { hubId, id }: AgentRef): readonly string[] {
  const [places, setPlaces] = useState<readonly string[]>([]);
  useEffect(() => {
    let stopped = false;
    const read = () =>
      Promise.all([host.referencesTo({ hubId, id }), host.routinesOf?.({ hubId, id }) ?? []])
        .then(([users, routines]) => renamePlaces(users, routines))
        .catch(() => [])
        .then((next) => {
          if (!stopped) setPlaces(next);
        });
    void read();
    const unsubscribe = host.subscribe(() => void read());
    return () => {
      stopped = true;
      unsubscribe();
    };
  }, [host, hubId, id]);
  return places;
}
