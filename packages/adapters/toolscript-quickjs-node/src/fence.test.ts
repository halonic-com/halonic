import { describeToolScriptIsolate } from "@halonicjs/testing-toolscript-fence";
import { createNodeWorkerToolScriptIsolate } from "./index.ts";

// This isolate takes no host functions and refuses a request with any
// (worker-isolate.test.ts), so the cases below, which each call a host
// function, are left out by design. Everything else runs as for QuickJS in
// the calling thread.
const callsHost = "calls a host function, which this isolate refuses";
const copiesArgument = "checks a host function's argument copy; this isolate passes no call out";
const usesHandle = "secret handles come from host functions; a handle in the input is refused";

const notPlainArguments = [
  "a getter",
  "a toJSON method",
  "a valueOf method",
  "a Symbol.toPrimitive method",
  "a class instance",
  "a function",
  "a symbol",
  "a symbol key",
  "NaN",
  "Infinity",
  "undefined in an object",
  "a sparse array",
  "an array with an extra key",
  "a hidden key",
  "a Date",
  "a Map",
  "a cycle",
  "two arguments",
];

const leaveOut: Record<string, string> = {
  "gives a frozen ctx and frozen namespaces with no prototype": callsHost,
  "calls a host function the same way with any this": callsHost,
  "never calls a saved ctx method after the run has ended": callsHost,
  "never calls a saved ctx method after a limit has tripped": callsHost,
  "never calls a host function the script called just before a limit tripped": callsHost,
  ...Object.fromEntries(
    notPlainArguments.map((label) => [
      `refuses ${label} without running any of the script's code`,
      copiesArgument,
    ]),
  ),
  "gives the host a frozen copy of plain data": copiesArgument,
  "never runs a toJSON or a descriptor getter the script put on Object.prototype": copiesArgument,
  "keeps an own __proto__ key in an argument a plain key": copiesArgument,
  "takes 8 levels and refuses 9": copiesArgument,
  "takes 100 items and refuses 101": copiesArgument,
  "takes 8,192 bytes of JSON and refuses 8,193": copiesArgument,
  // All five cases: an id and its handle back, a forged id, another run's id, a handle in the output or the log.
  "toolscript-fence.secret-handles": usesHandle,
  "allows 32 pending host calls and stops at the 33rd": callsHost,
  "allows 50 host calls for an agent and stops at the 51st": callsHost,
  "stops at the wall clock while the script waits": `${callsHost}; worker-isolate.test.ts kills at the wall clock`,
  "doesn't count time spent waiting on the host as CPU": callsHost,
  "stops with a host function's listed reason, and with a cancel": `${callsHost}; worker-isolate.test.ts cancels`,
  "cuts a long error message and never passes a host function's own message on": `half ${callsHost}; worker-isolate.test.ts checks the cut`,
};

describeToolScriptIsolate("QuickJS in a Node worker", () => createNodeWorkerToolScriptIsolate(), {
  leaveOut,
});
