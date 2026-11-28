import {
  type AgentConnection,
  type AgentConnections,
  AgentConnectionsService,
} from "@halonicjs/studio-services";
import type {
  SignInAttempt,
  SignInContribution,
  SignInReading,
  WorkspaceContext,
} from "@halonicjs/studio-shell";

/**
 * The Paperclip sign-in every app shows when a connection is signed out
 * (`connections.paperclip-sign-in-needed`). The Inbox and the Messenger can't work without it, so
 * they show it in a modal; Studio's window shows it in the band. Each signed-out connection is one
 * row, named by its label.
 */
export const paperclipSignIn: SignInContribution = {
  id: "connections.paperclip",
  provider: "Paperclip",
  purpose: "your agents",
  blockingFor: ["inbox", "messenger"],
  watch: watchSignedOut,
  start: startSignIn,
};

function watchSignedOut(
  context: WorkspaceContext,
  listener: (reading: SignInReading) => void,
): () => void {
  const connections = context.services.find(AgentConnectionsService);
  if (connections === undefined) {
    listener({ kind: "read", needs: [] });
    return () => undefined;
  }
  let watching = true;
  const read = (): void => {
    connections.list().then(
      (list) => {
        if (watching) listener({ kind: "read", needs: signedOut(list) });
      },
      (error: unknown) => {
        if (watching) listener({ kind: "unreadable", error });
      },
    );
  };
  const stop = connections.subscribe(read);
  read();
  return () => {
    watching = false;
    stop();
  };
}

function signedOut(list: readonly AgentConnection[]) {
  return list
    .filter(
      (connection) => connection.provider === "paperclip" && connection.state.kind === "signed-out",
    )
    .map((connection) => ({ id: connection.id, name: connection.label }));
}

async function startSignIn(context: WorkspaceContext, needId: string): Promise<SignInAttempt> {
  const connections: AgentConnections = context.services.get(AgentConnectionsService);
  const connection = (await connections.list()).find((candidate) => candidate.id === needId);
  if (connection === undefined) {
    throw new Error(`No Paperclip connection has the id "${needId}" any more.`);
  }
  const answer = await connections.signIn({
    address: connection.address,
    connection: connection.id,
  });
  if (answer.outcome === "refused") {
    throw new Error(`Paperclip refused the sign-in: ${answer.reason}`);
  }
  const { challenge } = answer;
  return {
    phrase: challenge.phrase,
    approvalUrl: challenge.approvalUrl,
    finished: challenge.result.then((result) =>
      result.outcome === "connected" ? "signed-in" : "failed",
    ),
  };
}
