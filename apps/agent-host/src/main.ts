// The agent host's entry point. A placeholder: it prints its version and exits.
// The real host (E1) replaces it. It imports nothing, so the build can turn it
// into a single executable without a bundler. The files the host will run
// from are embedded next to it (see build/payload.ts); unpacking them is next.

// Put in front of this file by the build. Missing when the file runs from source.
declare const HALONIC_AGENT_HOST_VERSION: string | undefined;

const version =
  typeof HALONIC_AGENT_HOST_VERSION === "string" ? HALONIC_AGENT_HOST_VERSION : "0.0.0-source";

process.stdout.write(`halonic-agent-host ${version}\n`);
