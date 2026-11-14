import { useToastStore } from "@halonicjs/studio-kit";
import type { DialogHostProps } from "@halonicjs/studio-shell";
import { useEffect, useRef } from "react";
import { AgentSandboxService } from "../api.ts";
import { SandboxFlowService } from "./sandbox-flow.ts";
import { setUpForToast } from "./sandbox-set-up.ts";
import * as text from "./sandbox-text.ts";

/**
 * Runs the setup Ctrl K asks for and says how it ended in a toast (`settings.sandbox-host`):
 * "The agent sandbox is set up", or "isn't set up: cause" with **Open Settings**. It starts nothing
 * until the command is chosen.
 */
export function SandboxHost({ context }: DialogHostProps) {
  const toasts = useToastStore();
  const host = context.services.find(AgentSandboxService);
  const flow = context.services.find(SandboxFlowService);
  const running = useRef(false);
  const openRef = useRef(context.openSettings);
  openRef.current = context.openSettings;

  useEffect(() => {
    if (host === undefined || flow === undefined || toasts === null) return;
    return flow.onRequest(async () => {
      if (running.current) return;
      running.current = true;
      const result = await setUpForToast(host);
      running.current = false;
      const open = openRef.current;
      if (result.cause === null) {
        toasts.show({ tone: "success", title: text.TOAST_SET_UP });
        return;
      }
      toasts.show({
        tone: "danger",
        title: text.toastNotSetUp(result.cause),
        ...(open
          ? { action: { label: text.OPEN_SETTINGS, onClick: () => open("agent-sandbox") } }
          : {}),
      });
    });
  }, [host, flow, toasts]);

  return null;
}
