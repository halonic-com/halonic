import { useEffect, useState } from "react";
import type { AgentSandboxHost } from "../api.ts";

/**
 * Whether the agent sandbox is set up on this computer (ready, or set up but needing a repair), for
 * the line that an update sets it up again (`settings.about-setup-again`). It asks the host's check
 * only when `wanted`, so About Halonic runs no check for an ordinary update. False until the check
 * answers, and when it can't: the line then stays away rather than promise a prompt.
 */
export function useSandboxSetUp(host: AgentSandboxHost | undefined, wanted: boolean): boolean {
  const [setUp, setSetUp] = useState(false);
  useEffect(() => {
    if (host === undefined || !host.available || !wanted) return;
    let alive = true;
    host.check().then(
      (facts) => {
        if (alive) setSetUp(facts.state === "ready" || facts.state === "needs-repair");
      },
      () => {
        if (alive) setSetUp(false);
      },
    );
    return () => {
      alive = false;
    };
  }, [host, wanted]);
  return setUp;
}
