import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Code, ConnectError, createClient, createRouterTransport } from "@connectrpc/connect";
import { EditorService } from "@flowserver/proto-gen";
import { decodeFlow, encodeFlow, type Flow } from "@flowserver/core";
import { registerFilesRoutes } from "../../src/connect/files.service.js";

// Mirrors tests/files.routes.test.ts's REST suite (same scenarios, including the explicit
// path-traversal attack payloads), but driving the Connect RPC handlers end-to-end through
// createRouterTransport() — a real Connect wire round-trip (binary protocol, in-process)
// rather than a bare function call, so this also exercises (de)serialization of the
// FlatBuffers-encoded `flatbuffer_flow` bytes field.

let projectDir: string;

beforeEach(() => {
  projectDir = mkdtempSync(path.join(os.tmpdir(), "flowserver-connect-test-"));
});

afterEach(() => {
  rmSync(projectDir, { recursive: true, force: true });
});

function makeClient(dir: string) {
  const transport = createRouterTransport((router) => {
    registerFilesRoutes(router, { projectDir: dir });
  });
  return createClient(EditorService, transport);
}

async function expectCode(promise: Promise<unknown>, code: Code) {
  await expect(promise).rejects.toSatisfy((err: unknown) => {
    return err instanceof ConnectError && err.code === code;
  });
}

describe("ListFiles", () => {
  it("returns an empty tree for a fresh project dir", async () => {
    const client = makeClient(projectDir);
    const res = await client.listFiles({});

    expect(res.tree).toEqual([]);
  });
});

describe("CreateFolder", () => {
  it("creates a folder", async () => {
    const client = makeClient(projectDir);
    const res = await client.createFolder({ path: "helpers" });

    expect(res.ok).toBe(true);
    expect(existsSync(path.join(projectDir, "helpers"))).toBe(true);
  });

  it("rejects with AlreadyExists if the folder already exists", async () => {
    const client = makeClient(projectDir);
    await client.createFolder({ path: "helpers" });

    await expectCode(client.createFolder({ path: "helpers" }), Code.AlreadyExists);
  });

  it("rejects with InvalidArgument on a path-traversal attempt and creates nothing outside the project dir", async () => {
    const client = makeClient(projectDir);

    await expectCode(client.createFolder({ path: "../evil-folder" }), Code.InvalidArgument);
    expect(existsSync(path.join(projectDir, "..", "evil-folder"))).toBe(false);
  });
});

describe("CreateBlueprint", () => {
  it("creates a blueprint with the expected initial content shape", async () => {
    const client = makeClient(projectDir);
    const res = await client.createBlueprint({ path: "src/server.blueprint" });

    expect(res.ok).toBe(true);
    const flow = decodeFlow(res.flatbufferFlow);
    expect(flow).toEqual({
      version: "1",
      meta: { name: "server", target: "express" },
      nodes: [],
      edges: [],
      variables: [],
    });

    const onDisk = decodeFlow(readFileSync(path.join(projectDir, "src", "server.blueprint")));
    expect(onDisk).toEqual(flow);
  });

  it("rejects with InvalidArgument on the wrong extension", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.createBlueprint({ path: "src/server.txt" }), Code.InvalidArgument);
  });

  it("rejects with AlreadyExists if the blueprint already exists", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "a.blueprint" });

    await expectCode(client.createBlueprint({ path: "a.blueprint" }), Code.AlreadyExists);
  });

  it("rejects with InvalidArgument on a relative path-traversal attempt and creates nothing outside the project dir", async () => {
    const client = makeClient(projectDir);

    await expectCode(client.createBlueprint({ path: "../../etc/passwd.blueprint" }), Code.InvalidArgument);
    expect(existsSync(path.join(projectDir, "..", "..", "etc"))).toBe(false);
    expect(existsSync(path.join(path.dirname(projectDir), "etc"))).toBe(false);
  });

  it("rejects with InvalidArgument on an absolute path attempt", async () => {
    const client = makeClient(projectDir);
    const absoluteEvil = path.join(os.tmpdir(), "flowserver-connect-evil.blueprint");

    await expectCode(client.createBlueprint({ path: absoluteEvil }), Code.InvalidArgument);
    expect(existsSync(absoluteEvil)).toBe(false);
  });
});

describe("GetBlueprint", () => {
  it("reads back a created blueprint", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "a.blueprint" });

    const res = await client.getBlueprint({ path: "a.blueprint" });
    const flow = decodeFlow(res.flatbufferFlow);

    expect(flow.meta.name).toBe("a");
  });

  it("rejects with NotFound on a nonexistent file", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.getBlueprint({ path: "nope.blueprint" }), Code.NotFound);
  });

  it("rejects with InvalidArgument on a path-traversal attempt", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.getBlueprint({ path: "../../../etc/passwd.blueprint" }), Code.InvalidArgument);
  });

  it("rejects with InvalidArgument on an absolute path attempt", async () => {
    const client = makeClient(projectDir);
    await expectCode(
      client.getBlueprint({ path: path.join(os.tmpdir(), "flowserver-connect-evil.blueprint") }),
      Code.InvalidArgument,
    );
  });

  it("rejects with InvalidArgument on the wrong extension", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.getBlueprint({ path: "a.txt" }), Code.InvalidArgument);
  });
});

describe("SaveBlueprint", () => {
  it("upserts content for a path (creating it if it doesn't exist)", async () => {
    const client = makeClient(projectDir);
    const flow: Flow = { version: "1", meta: { name: "a", target: "express" }, nodes: [], edges: [], variables: [] };

    const res = await client.saveBlueprint({ path: "a.blueprint", flatbufferFlow: encodeFlow(flow) });

    expect(res.ok).toBe(true);
    const onDisk = decodeFlow(readFileSync(path.join(projectDir, "a.blueprint")));
    expect(onDisk).toEqual(flow);
  });

  it("rejects with InvalidArgument on the wrong extension", async () => {
    const client = makeClient(projectDir);
    const flow: Flow = { version: "1", meta: { name: "a", target: "express" }, nodes: [], edges: [], variables: [] };
    await expectCode(
      client.saveBlueprint({ path: "a.txt", flatbufferFlow: encodeFlow(flow) }),
      Code.InvalidArgument,
    );
  });

  it("rejects with InvalidArgument on a path-traversal attempt and writes nothing outside the project dir", async () => {
    const client = makeClient(projectDir);
    const flow: Flow = { version: "1", meta: { name: "a", target: "express" }, nodes: [], edges: [], variables: [] };

    await expectCode(
      client.saveBlueprint({ path: "../../evil.blueprint", flatbufferFlow: encodeFlow(flow) }),
      Code.InvalidArgument,
    );
    expect(existsSync(path.join(path.dirname(path.dirname(projectDir)), "evil.blueprint"))).toBe(false);
  });
});

describe("RenamePath", () => {
  it("renames a file", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "old.blueprint" });

    const res = await client.renamePath({ from: "old.blueprint", to: "new.blueprint" });

    expect(res.ok).toBe(true);
    expect(existsSync(path.join(projectDir, "old.blueprint"))).toBe(false);
    expect(existsSync(path.join(projectDir, "new.blueprint"))).toBe(true);
  });

  it("rejects with NotFound if `from` doesn't exist", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.renamePath({ from: "nope.blueprint", to: "new.blueprint" }), Code.NotFound);
  });

  it("rejects with AlreadyExists if `to` already exists", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "a.blueprint" });
    await client.createBlueprint({ path: "b.blueprint" });

    await expectCode(client.renamePath({ from: "a.blueprint", to: "b.blueprint" }), Code.AlreadyExists);
  });

  it("rejects with InvalidArgument on a path-traversal attempt in `to`", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "a.blueprint" });

    await expectCode(client.renamePath({ from: "a.blueprint", to: "../evil.blueprint" }), Code.InvalidArgument);
    expect(existsSync(path.join(path.dirname(projectDir), "evil.blueprint"))).toBe(false);
  });
});

describe("DeletePath", () => {
  it("deletes a file", async () => {
    const client = makeClient(projectDir);
    await client.createBlueprint({ path: "a.blueprint" });

    const res = await client.deletePath({ path: "a.blueprint" });

    expect(res.ok).toBe(true);
    expect(existsSync(path.join(projectDir, "a.blueprint"))).toBe(false);
  });

  it("deletes a folder recursively", async () => {
    const client = makeClient(projectDir);
    await client.createFolder({ path: "helpers" });
    await client.createBlueprint({ path: "helpers/a.blueprint" });

    const res = await client.deletePath({ path: "helpers" });

    expect(res.ok).toBe(true);
    expect(existsSync(path.join(projectDir, "helpers"))).toBe(false);
  });

  it("rejects with NotFound on a nonexistent path", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.deletePath({ path: "nope.blueprint" }), Code.NotFound);
  });

  it("rejects with InvalidArgument on a path-traversal attempt", async () => {
    const client = makeClient(projectDir);
    await expectCode(client.deletePath({ path: "../../etc" }), Code.InvalidArgument);
  });
});
