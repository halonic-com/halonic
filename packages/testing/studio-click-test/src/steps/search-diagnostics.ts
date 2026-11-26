// HAL-19044 diagnostics only, never merged: records what the page asks the shell during Ctrl K,
// and what the agent host answers to a search asked directly, so step 10's note names the cause.

/** Hooks the page's Tauri calls and console errors into `window.__ctLog`. */
export const hookScript = `
const done = arguments[arguments.length - 1];
const log = (window.__ctLog = window.__ctLog || []);
try {
  const internals = window.__TAURI_INTERNALS__;
  if (!window.__ctHooked) {
    window.__ctHooked = true;
    const original = internals.invoke.bind(internals);
    internals.invoke = (cmd, args, options) => {
      const started = Date.now();
      const answer = original(cmd, args, options);
      const body = args && args.body;
      if (body && body.workspace) window.__ctWorkspace = body.workspace;
      Promise.resolve(answer).then(
        () => { if (cmd === "agent_host_request") log.push("ok " + (args && args.route) + " " + (body && body.list ? body.list : "") + " " + (Date.now() - started) + "ms"); },
        (error) => log.push("FAILED " + cmd + " " + (args && args.route ? args.route : "") + " " + (body && body.list ? body.list : "") + " " + (Date.now() - started) + "ms: " + JSON.stringify(error).slice(0, 600)),
      );
      return answer;
    };
    const consoleError = console.error.bind(console);
    console.error = (...parts) => {
      log.push("console.error " + parts.map((part) => part instanceof Error ? part.name + ": " + part.message : typeof part === "object" ? JSON.stringify(part) : String(part)).join(" ").slice(0, 600));
      consoleError(...parts);
    };
    window.addEventListener("unhandledrejection", (event) => log.push("unhandled " + String(event.reason).slice(0, 600)));
  }
  done("hooked");
} catch (error) {
  done("hook failed: " + String(error));
}
`;

/** Asks the agent host for the sources and a search directly, then returns everything logged. */
export const readScript = (text: string) => `
const done = arguments[arguments.length - 1];
const log = window.__ctLog || [];
const internals = window.__TAURI_INTERNALS__;
const workspace = window.__ctWorkspace;
const ask = (list) => internals.invoke("agent_host_request", { route: "POST /v1/messaging/read", body: { workspace, list, text: ${JSON.stringify(text)} } })
  .then((answer) => "direct " + list + " ok: " + JSON.stringify(answer).slice(0, 400), (error) => "direct " + list + " FAILED: " + JSON.stringify(error).slice(0, 600));
(workspace === undefined ? Promise.resolve(["no workspace seen"]) : Promise.all([ask("sources"), ask("search")]))
  .then((direct) => done([...log, ...direct].join(" | ")), (error) => done([...log, "read failed: " + String(error)].join(" | ")));
`;
