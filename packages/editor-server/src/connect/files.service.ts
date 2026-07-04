import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { ConnectError, Code, type ConnectRouter } from "@connectrpc/connect";
import { decodeFlow, encodeFlow, type Flow } from "@flowserver/core";
import { EditorService, FileTreeNode_Kind } from "@flowserver/proto-gen";
import type { AppConfig } from "../config.js";
import { isPlausibleFlow } from "../flow-shape.js";
import { listTree, type FileTreeNode as LocalFileTreeNode } from "../file-tree.js";
import { resolveSafePath } from "../path-safety.js";

/**
 * Connect RPC implementations for the file-tree CRUD surface of `EditorService`
 * (ListFiles/CreateFolder/CreateBlueprint/GetBlueprint/SaveBlueprint/RenamePath/DeletePath),
 * mirroring `routes/files.routes.ts`'s REST endpoints exactly. Reuses the same
 * `resolveSafePath()` (path-traversal guard), `listTree()`, and `isPlausibleFlow()` helpers
 * the REST routes call — no business logic is duplicated, only re-expressed as unary RPCs.
 *
 * `.blueprint` files are now stored on disk in the same FlatBuffers-encoded binary format as
 * the RPC's own `bytes flatbuffer_flow` wire field (see
 * docs/phase8-backend-grpc-flatbuffers-plan.md), so — unlike during the transport-only
 * cutover — the on-disk bytes and the wire bytes are identical: `createBlueprint`/
 * `saveBlueprint` write `req.flatbufferFlow`/`encodeFlow(...)`'s output straight to disk with
 * no JSON step, and `getBlueprint` returns the raw file bytes straight back as
 * `flatbufferFlow` with no re-encode. `decodeFlow` is still called once on read, purely to
 * validate the bytes are well-formed (and to hand `isPlausibleFlow` an actual `Flow` to
 * shape-check) before trusting them.
 */

/** Local, plain-object mirror of proto-gen's `FileTreeNode` message shape (a
 * `MessageInitShape`, not the hydrated `Message` type) — kept untyped-against-proto-gen so
 * this file never needs a direct `@bufbuild/protobuf` import (not a declared dependency of
 * this package; only `@connectrpc/connect` and `@flowserver/proto-gen` are). */
interface ProtoFileTreeNode {
  kind: FileTreeNode_Kind;
  name: string;
  relativePath: string;
  children: ProtoFileTreeNode[];
}

function toProtoTree(nodes: LocalFileTreeNode[]): ProtoFileTreeNode[] {
  return nodes.map((n) =>
    n.type === "folder"
      ? {
          kind: FileTreeNode_Kind.FOLDER,
          name: n.name,
          relativePath: n.relativePath,
          children: toProtoTree(n.children),
        }
      : { kind: FileTreeNode_Kind.FILE, name: n.name, relativePath: n.relativePath, children: [] },
  );
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

/** Mirrors files.routes.ts's (unexported) `emptyBlueprint()`. */
function emptyBlueprint(basename: string): Flow {
  return {
    version: "1",
    meta: { name: basename, target: "express" },
    nodes: [],
    edges: [],
    variables: [],
  };
}

function invalidPath(): ConnectError {
  return new ConnectError("Invalid or missing path", Code.InvalidArgument);
}

/** Registers the file-tree CRUD RPCs on `router`. Uses `router.rpc()` per-method (not
 * `router.service()`) so this registration only claims the seven methods it implements,
 * leaving the rest of `EditorService` free for other registration modules to claim their
 * own subset of methods on the same router without clobbering each other. */
export function registerFilesRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  return router
    .rpc(EditorService.method.listFiles, async () => {
      const tree = await listTree(config.projectDir);
      return { tree: toProtoTree(tree) };
    })

    .rpc(EditorService.method.createFolder, async (req) => {
      const requestedPath = req.path;
      const target = resolveSafePath(config.projectDir, requestedPath);
      if (!target) throw invalidPath();

      if (await pathExists(target)) {
        throw new ConnectError(`A file or folder already exists at "${requestedPath}"`, Code.AlreadyExists);
      }

      await mkdir(target, { recursive: true });
      return { ok: true, path: requestedPath };
    })

    .rpc(EditorService.method.createBlueprint, async (req) => {
      const requestedPath = req.path;
      if (typeof requestedPath !== "string" || !requestedPath.endsWith(".blueprint")) {
        throw new ConnectError('`path` must end in ".blueprint"', Code.InvalidArgument);
      }
      const target = resolveSafePath(config.projectDir, requestedPath);
      if (!target) throw invalidPath();

      if (await pathExists(target)) {
        throw new ConnectError(`A file already exists at "${requestedPath}"`, Code.AlreadyExists);
      }

      const basename = path.basename(requestedPath, ".blueprint");
      const flow = emptyBlueprint(basename);
      const flatbufferFlow = encodeFlow(flow);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, flatbufferFlow);
      return { ok: true, path: requestedPath, flatbufferFlow };
    })

    .rpc(EditorService.method.getBlueprint, async (req) => {
      const requestedPath = req.path;
      if (typeof requestedPath !== "string" || !requestedPath.endsWith(".blueprint")) {
        throw new ConnectError('`path` must end in ".blueprint"', Code.InvalidArgument);
      }
      const target = resolveSafePath(config.projectDir, requestedPath);
      if (!target) throw invalidPath();

      let raw: Buffer;
      try {
        raw = await readFile(target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          throw new ConnectError(`No file at "${requestedPath}"`, Code.NotFound);
        }
        throw err;
      }
      const flatbufferFlow = new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);

      let flow: Flow;
      try {
        flow = decodeFlow(flatbufferFlow);
      } catch (err) {
        throw new ConnectError(`"${requestedPath}" could not be decoded: ${(err as Error).message}`, Code.Internal);
      }
      if (!isPlausibleFlow(flow)) {
        throw new ConnectError(`"${requestedPath}" is not a valid flow`, Code.Internal);
      }

      return { flatbufferFlow };
    })

    .rpc(EditorService.method.saveBlueprint, async (req) => {
      const requestedPath = req.path;
      if (typeof requestedPath !== "string" || !requestedPath.endsWith(".blueprint")) {
        throw new ConnectError('`path` must end in ".blueprint"', Code.InvalidArgument);
      }
      const target = resolveSafePath(config.projectDir, requestedPath);
      if (!target) throw invalidPath();

      let flow: Flow;
      try {
        flow = decodeFlow(req.flatbufferFlow);
      } catch (err) {
        throw new ConnectError(
          `\`flatbuffer_flow\` is not a valid encoded flow: ${(err as Error).message}`,
          Code.InvalidArgument,
        );
      }
      if (!isPlausibleFlow(flow)) {
        throw new ConnectError(
          "`flatbuffer_flow` must decode to a flow with `nodes`, `edges`, and `meta`",
          Code.InvalidArgument,
        );
      }

      await mkdir(path.dirname(target), { recursive: true });
      // Write the exact bytes the client sent (already validated above), not a re-encode of
      // the decoded Flow — this preserves byte-for-byte round-tripping and avoids a pointless
      // decode+re-encode cycle now that wire format and disk format are the same thing.
      await writeFile(target, req.flatbufferFlow);
      return { ok: true };
    })

    .rpc(EditorService.method.renamePath, async (req) => {
      const from = req.from;
      const to = req.to;
      const fromTarget = resolveSafePath(config.projectDir, from);
      const toTarget = resolveSafePath(config.projectDir, to);
      if (!fromTarget || !toTarget) throw invalidPath();

      if (!(await pathExists(fromTarget))) {
        throw new ConnectError(`No file or folder at "${from}"`, Code.NotFound);
      }
      if (await pathExists(toTarget)) {
        throw new ConnectError(`A file or folder already exists at "${to}"`, Code.AlreadyExists);
      }

      await mkdir(path.dirname(toTarget), { recursive: true });
      await rename(fromTarget, toTarget);
      return { ok: true };
    })

    .rpc(EditorService.method.deletePath, async (req) => {
      const requestedPath = req.path;
      const target = resolveSafePath(config.projectDir, requestedPath);
      if (!target) throw invalidPath();

      let exists = true;
      try {
        await stat(target);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") exists = false;
        else throw err;
      }
      if (!exists) {
        throw new ConnectError(`No file or folder at "${requestedPath}"`, Code.NotFound);
      }

      await rm(target, { recursive: true, force: false });
      return { ok: true };
    });
}
