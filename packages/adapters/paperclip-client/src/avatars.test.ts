import { verifies } from "@halonicjs/testing-spec";
import { beforeEach, describe, expect, it } from "vitest";
import { company, testKey } from "./acme-data.test-helper.ts";
import { avatarMaxBytes } from "./avatars.ts";
import {
  connect,
  type FakeAnswer,
  FakePaperclip,
  type Network,
} from "./fake-paperclip.test-helper.ts";
import { findRequest } from "./requests.ts";

/** A 1×1 transparent PNG made for the tests, not any agent's real picture. */
const png = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (character) => character.charCodeAt(0),
);

const pictureRoute = "/api/agent-avatars/ada.png";
const pictureId = "paperclip:acme:avatar:ada.png";

let paperclip: FakePaperclip;
const network: Network = { offline: false };

beforeEach(() => {
  network.offline = false;
  paperclip = new FakePaperclip();
});

const client = () => connect(paperclip, network);

/** Serves one Acme agent per `avatarUrl`, Ada first. */
function serveAgents(...avatarUrls: (string | null)[]): void {
  paperclip.on("GET", `/api/companies/${company}/agents`, {
    body: avatarUrls.map((avatarUrl, index) => ({
      id: `a${index}`,
      name: index === 0 ? "Ada" : `Agent ${index}`,
      status: "idle",
      avatarUrl,
    })),
  });
}

function servePicture(answer: FakeAnswer): void {
  paperclip.on("GET", pictureRoute, answer);
}

/** A body of `size` zero bytes, streamed in two chunks with no stated length. */
function streamOf(size: number): ReadableStream<Uint8Array> {
  const half = Math.floor(size / 2);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(half));
      controller.enqueue(new Uint8Array(size - half));
      controller.close();
    },
  });
}

verifies("ports.agent-messaging-avatars", () => {
  describe("an agent's picture", () => {
    it("is an ID that holds no address, for a path under /api/agent-avatars/", async () => {
      serveAgents("/api/agent-avatars/ada.png");
      const [ada] = await client().listAgents();
      expect(ada?.avatar).toBe(pictureId);
      expect(ada?.avatar).not.toContain("/");
    });

    it("is left out for an absolute, foreign or other address", async () => {
      serveAgents(
        "https://paperclip.acme.test/api/agent-avatars/ada.png",
        "https://elsewhere.example/ada.png",
        "//elsewhere.example/api/agent-avatars/ada.png",
        "/api/agent-avatars/../keys",
        "/api/agent-avatars/%2e%2e",
        "/api/agent-avatars/ada.png?size=big",
        "/api/agent-avatars/team/ada.png",
        "/avatars/ada.png",
        null,
      );
      const agents = await client().listAgents();
      expect(agents).toHaveLength(9);
      expect(agents.filter((agent) => "avatar" in agent)).toEqual([]);
    });

    it("is read on the connection's own host, with its key, by a request on the list", async () => {
      servePicture({
        body: png,
        headers: { "content-type": "image/png", "content-length": String(png.byteLength) },
      });
      expect(await client().readAttachment(pictureId)).toEqual({
        outcome: "read",
        bytes: png,
        type: "image/png",
      });
      const [request] = paperclip.seen;
      expect(paperclip.seen).toHaveLength(1);
      expect(request?.path).toBe(pictureRoute);
      expect(request?.headers.get("authorization")).toBe(`Bearer ${testKey}`);
      expect(findRequest(request?.method ?? "", request?.path ?? "")).toBe("readAgentAvatar");
    });

    it("is read as JPEG or WebP too, whatever the type's case and parameters", async () => {
      servePicture({ body: png, headers: { "content-type": "Image/WebP; charset=binary" } });
      expect(await client().readAttachment(pictureId)).toMatchObject({ type: "image/webp" });
      servePicture({ body: png, headers: { "content-type": "image/jpeg" } });
      expect(await client().readAttachment(pictureId)).toMatchObject({ type: "image/jpeg" });
    });

    it("is refused as SVG, GIF, HTML or without a type", async () => {
      for (const type of ["image/svg+xml", "image/gif", "text/html"]) {
        servePicture({ body: png, headers: { "content-type": type } });
        expect(await client().readAttachment(pictureId)).toEqual({
          outcome: "refused",
          reason: "unsupported-type",
        });
      }
      servePicture({ body: png, headers: {} });
      expect(await client().readAttachment(pictureId)).toMatchObject({
        reason: "unsupported-type",
      });
    });

    it("is refused over 256 KB, by its stated length or by the bytes that came", async () => {
      const tooLarge = { outcome: "refused", reason: "too-large" };
      servePicture({
        body: png,
        headers: { "content-type": "image/png", "content-length": String(avatarMaxBytes + 1) },
      });
      expect(await client().readAttachment(pictureId)).toEqual(tooLarge);
      servePicture({
        body: streamOf(avatarMaxBytes + 1),
        headers: { "content-type": "image/png" },
      });
      expect(await client().readAttachment(pictureId)).toEqual(tooLarge);
      servePicture({ body: streamOf(avatarMaxBytes), headers: { "content-type": "image/png" } });
      const read = await client().readAttachment(pictureId);
      expect(read.outcome === "read" && read.bytes.byteLength).toBe(avatarMaxBytes);
    });

    it("is refused when missing, offline or signed out, and a redirect throws", async () => {
      expect(await client().readAttachment(pictureId)).toMatchObject({ reason: "not-found" });
      servePicture({ status: 401 });
      expect(await client().readAttachment(pictureId)).toMatchObject({ reason: "signed-out" });
      network.offline = true;
      expect(await client().readAttachment(pictureId)).toMatchObject({ reason: "offline" });
      network.offline = false;
      servePicture({ status: 302, headers: { location: "https://elsewhere.example/ada.png" } });
      await expect(client().readAttachment(pictureId)).rejects.toThrow(/redirect/);
    });

    it("never reads an attachment's, another connection's or an unsafe ID, and sends nothing", async () => {
      for (const id of [
        "paperclip:acme:file:ada.png",
        "paperclip:acme:agent:ada.png",
        "paperclip:other:avatar:ada.png",
        "paperclip:acme:avatar:..",
        "paperclip:acme:avatar:a%2Fb.png",
      ]) {
        expect(await client().readAttachment(id)).toEqual({
          outcome: "refused",
          reason: "not-found",
        });
      }
      expect(paperclip.seen).toEqual([]);
    });
  });
});
