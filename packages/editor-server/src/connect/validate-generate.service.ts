import path from "node:path";
import { ConnectError, Code, type ConnectRouter } from "@connectrpc/connect";
import {
  collectFlowDependencies,
  decodeFlow,
  validateFlow as validateFlowCore,
  writeGeneratedFile,
  type Flow,
  type ValidationError as CoreValidationError,
} from "@visual-node/core";
import {
  EditorService,
  type ValidationError as ProtoValidationError,
  type ValidateFlowRequest,
  type ValidateFlowResponse,
  type GenerateCodeRequest,
  type GenerateCodeResponse,
  type WriteGeneratedCodeRequest,
  type WriteGeneratedCodeResponse,
} from "@visual-node/proto-gen";
import type { AppConfig } from "../config.js";
import { compile, ensureCommonJsPackageJson } from "../codegen-helpers.js";

/**
 * Connect RPC implementations for ValidateFlow, GenerateCode, and WriteGeneratedCode —
 * the Connect-transport equivalents of packages/editor-server/src/routes/validate.routes.ts
 * (POST /api/validate) and packages/editor-server/src/routes/generate.routes.ts (POST
 * /api/generate, POST /api/generate/write). Business logic is not duplicated: this file
 * calls the exact same `validateFlow`/`compile`/`writeGeneratedFile`/
 * `ensureCommonJsPackageJson` helpers the REST routes call, only the transport
 * (Connect unary RPC instead of an Express JSON body) and the `Flow` wire format
 * (FlatBuffers-encoded `bytes flatbuffer_flow` instead of a JSON `req.body.flow`) differ.
 *
 * Registered as individual `router.rpc(...)` calls rather than one `router.service(...)`
 * call, since this only implements 3 of EditorService's ~21 methods — `router.service()`
 * would register "unimplemented" stubs for every method this file doesn't own, clobbering
 * whatever another service-group file registers for those methods when both are wired into
 * the same router during final app.ts integration.
 */
export function registerValidateGenerateRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  router.rpc(EditorService.method.validateFlow, (req) => validateFlowRpc(req));
  router.rpc(EditorService.method.generateCode, (req) => generateCodeRpc(req));
  router.rpc(EditorService.method.writeGeneratedCode, (req) => writeGeneratedCodeRpc(req, config));
  return router;
}

/**
 * Decodes the request's opaque FlatBuffers-encoded `Flow`. A malformed/corrupt byte payload
 * is a client-supplied-garbage problem, not an expected "flow is invalid" outcome the UI
 * displays inline — so it's surfaced as a `ConnectError` (InvalidArgument), not folded into
 * the `valid`/`errors` response fields the way `validateFlow()`'s structural errors are.
 */
function decodeFlowOrThrow(bytes: Uint8Array): Flow {
  try {
    return decodeFlow(bytes);
  } catch (err) {
    throw new ConnectError(
      `Request's flatbuffer_flow could not be decoded: ${err instanceof Error ? err.message : String(err)}`,
      Code.InvalidArgument,
    );
  }
}

function toProtoValidationError(e: CoreValidationError): ProtoValidationError {
  return {
    $typeName: "visual_node.v1.ValidationError",
    nodeId: e.nodeId ?? "",
    blueprintNodeId: e.blueprintNodeId ?? "",
    message: e.message,
    relativePath: "",
  };
}

async function validateFlowRpc(req: ValidateFlowRequest): Promise<ValidateFlowResponse> {
  const flow = decodeFlowOrThrow(req.flatbufferFlow);
  const result = validateFlowCore(flow);
  return {
    $typeName: "visual_node.v1.ValidateFlowResponse",
    valid: result.valid,
    errors: result.errors.map(toProtoValidationError),
  };
}

async function generateCodeRpc(req: GenerateCodeRequest): Promise<GenerateCodeResponse> {
  const flow = decodeFlowOrThrow(req.flatbufferFlow);
  const result = await compile(flow);

  if (!result.valid) {
    return {
      $typeName: "visual_node.v1.GenerateCodeResponse",
      valid: false,
      code: "",
      errors: result.errors.map(toProtoValidationError),
    };
  }
  return {
    $typeName: "visual_node.v1.GenerateCodeResponse",
    valid: true,
    code: result.code,
    errors: [],
  };
}

async function writeGeneratedCodeRpc(
  req: WriteGeneratedCodeRequest,
  config: AppConfig,
): Promise<WriteGeneratedCodeResponse> {
  const flow = decodeFlowOrThrow(req.flatbufferFlow);
  const result = await compile(flow);

  if (!result.valid) {
    return {
      $typeName: "visual_node.v1.WriteGeneratedCodeResponse",
      valid: false,
      written: false,
      path: "",
      errors: result.errors.map(toProtoValidationError),
    };
  }

  const serverPath = path.join(config.projectDir, "server.js");
  await writeGeneratedFile(serverPath, result.code);
  const { dependencies } = collectFlowDependencies(flow);
  await ensureCommonJsPackageJson(config.projectDir, flow.meta?.name ?? "visual-node-app", { dependencies });

  return {
    $typeName: "visual_node.v1.WriteGeneratedCodeResponse",
    valid: true,
    written: true,
    path: serverPath,
    errors: [],
  };
}
