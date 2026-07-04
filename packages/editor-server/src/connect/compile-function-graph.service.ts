import path from "node:path";
import type { ConnectRouter } from "@connectrpc/connect";
import { EditorService } from "@flowserver/proto-gen";
import {
  collectProjectDependencies,
  decodeFlow,
  emitFunctionGraphBody,
  FunctionGraphError,
  writeGeneratedFile,
  type FlowEdge,
  type FlowNode,
  type ProjectFileError,
} from "@flowserver/core";
import type { AppConfig } from "../config.js";
import { compileProjectFromDisk, ensureCommonJsPackageJson } from "../codegen-helpers.js";

/** Maps core/editor-server's `ProjectFileError` onto the generated `ValidationError` message init shape. */
function toValidationErrorInit(err: ProjectFileError) {
  return {
    nodeId: err.nodeId ?? "",
    blueprintNodeId: err.blueprintNodeId ?? "",
    message: err.message,
    relativePath: err.relativePath,
  };
}

/**
 * Registers the `CompileProject`, `WriteCompiledProject`, and `PreviewFunctionGraph` RPCs
 * from `EditorService` (see proto-gen's `editor_pb.ts` and
 * docs/phase8-backend-grpc-flatbuffers-plan.md). Business logic is not duplicated here: every
 * handler below is a thin Connect-shaped wrapper around the exact same helpers the REST routes
 * call — `compileProjectFromDisk`/`ensureCommonJsPackageJson`
 * (packages/editor-server/src/codegen-helpers.ts, also used by
 * packages/editor-server/src/routes/compile.routes.ts) and `emitFunctionGraphBody`/
 * `FunctionGraphError` (packages/core, also used by
 * packages/editor-server/src/routes/function-graph.routes.ts).
 */
export function registerCompileFunctionGraphRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  // POST /api/compile (preview) -> CompileProject. Mirrors compile.routes.ts's "/" handler:
  // read+compile the whole project from disk, no request payload (the route operates on
  // whatever's currently on disk, not on anything sent by the caller).
  router.rpc(EditorService.method.compileProject, async () => {
    const { result } = await compileProjectFromDisk(config.projectDir);
    if (!result.valid) {
      return { valid: false, results: [], errors: result.errors.map(toValidationErrorInit) };
    }
    return {
      valid: true,
      results: result.files.map((file) => ({ relativePath: file.relativePath, code: file.code })),
      errors: [],
    };
  });

  // POST /api/compile/write -> WriteCompiledProject. Mirrors compile.routes.ts's "/write"
  // handler: recompute the same compile (no caching/reuse of a prior CompileProject call,
  // exactly like the REST route recomputes on every write), then persist every file and
  // ensure a CommonJS package.json exists.
  router.rpc(EditorService.method.writeCompiledProject, async () => {
    const { sourceFiles, result } = await compileProjectFromDisk(config.projectDir);
    if (!result.valid) {
      return { valid: false, written: false, files: [], errors: result.errors.map(toValidationErrorInit) };
    }

    for (const file of result.files) {
      await writeGeneratedFile(path.join(config.projectDir, file.relativePath), file.code);
    }
    const { dependencies } = collectProjectDependencies(sourceFiles);
    await ensureCommonJsPackageJson(config.projectDir, path.basename(config.projectDir) || "flowserver-app", {
      dependencies,
    });

    return {
      valid: true,
      written: true,
      files: result.files.map((file) => ({ relativePath: file.relativePath, outputPath: file.relativePath })),
      errors: [],
    };
  });

  // POST /api/function-graph/preview -> PreviewFunctionGraph. Mirrors
  // function-graph.routes.ts: pure in-memory compile of a Function node's blueprint
  // sub-graph, always resolves successfully (never throws a Connect error) — an
  // incomplete/invalid graph is an expected, frequent state while a user is still wiring
  // nodes together, surfaced via the response's `error` oneof branch instead.
  //
  // `PreviewFunctionGraphRequest.flatbuffer_flow` carries only a graph (`{ nodes, edges }`),
  // not a full top-level `Flow` — it has no `meta`/`version` of its own. The caller is
  // expected to have filled those in with placeholder values before calling `encodeFlow`
  // (a full `Flow` is required to encode at all); `decodeFlow` here still returns a
  // full `Flow` shape because it always parses the strict FlatBuffers envelope, but only
  // `.nodes`/`.edges` carry real data for this RPC — `.meta`/`.version` are discarded.
  router.rpc(EditorService.method.previewFunctionGraph, async (req) => {
    try {
      let nodes: FlowNode[] = [];
      let edges: FlowEdge[] = [];
      if (req.flatbufferFlow && req.flatbufferFlow.length > 0) {
        const flow = decodeFlow(req.flatbufferFlow);
        nodes = flow.nodes;
        edges = flow.edges;
      }
      const { code: body } = emitFunctionGraphBody({ nodes, edges });
      return { result: { case: "body" as const, value: body } };
    } catch (err) {
      if (err instanceof FunctionGraphError) {
        return {
          result: {
            case: "error" as const,
            value: { message: err.message, blueprintNodeId: err.nodeId ?? "" },
          },
        };
      }
      return {
        result: {
          case: "error" as const,
          value: { message: err instanceof Error ? err.message : String(err), blueprintNodeId: "" },
        },
      };
    }
  });

  return router;
}
