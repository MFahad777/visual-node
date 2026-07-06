import { createClient } from "@connectrpc/connect";
import { createConnectTransport } from "@connectrpc/connect-web";
import { decodeFlow, encodeFlow } from "@visual-node/core/flatbuffer-flow";
import type { Flow, FlowEdge, FlowNode, NodeDefinition, ValidationError, VariableDeclaration } from "@visual-node/core";
import { EditorService, FileTreeNode_Kind } from "@visual-node/proto-gen";
import type {
  ConfigField as ProtoConfigField,
  FileTreeNode as ProtoFileTreeNode,
  NodeDefinition as ProtoNodeDefinition,
  PortDefinition as ProtoPortDefinition,
  ValidationError as ProtoValidationError,
} from "@visual-node/proto-gen";

// This file is a Connect-RPC-backed *facade*: every exported function/type below keeps
// the exact name, parameter types, and return type it had when this module called REST
// `fetch()`/`EventSource` directly (see docs/phase8-backend-grpc-flatbuffers-plan.md) so
// no other file in packages/editor-ui needs to change. Internally, everything now goes
// through a single Buf Connect client talking to editor-server's `EditorService`.
// `Flow` objects are encoded/decoded to FlatBuffers bytes at this boundary via
// `@visual-node/core/flatbuffer-flow` (the Node-builtin-free subpath — see that package's
// exports map and CLAUDE.md's "never a runtime import from the main core barrel" rule;
// `NodeDefinition`/`ValidationError` above are `import type` only).
const transport = createConnectTransport({ baseUrl: "/api" });
const client = createClient(EditorService, transport);

export type FileTreeNode =
  | { type: "file"; name: string; relativePath: string }
  | { type: "folder"; name: string; relativePath: string; children: FileTreeNode[] };

export interface CompiledFile {
  relativePath: string;
  code: string;
}

export interface ProjectFileError {
  relativePath: string;
  nodeId?: string;
  message: string;
}

export interface WrittenFile {
  relativePath: string;
  outputPath: string;
}

export interface ProjectSettings {
  mode: "server" | "script";
  entryFile?: string;
}

// ---- response-reshaping helpers (proto message -> legacy plain-object shape) ----

/** ValidationError (proto) -> core's ValidationError (used by ValidateFlow/GenerateCode/WriteGeneratedCode, which never carry a `relativePath`). */
function fromProtoValidationError(e: ProtoValidationError): ValidationError {
  return {
    nodeId: e.nodeId || undefined,
    blueprintNodeId: e.blueprintNodeId || undefined,
    message: e.message,
  };
}

/** ValidationError (proto) -> this module's local ProjectFileError (used by whole-project RPCs: CompileProject/WriteCompiledProject/StartRun's validationFailure — these do carry `relativePath`, but never `blueprintNodeId`, matching the legacy REST shape exactly). */
function fromProtoProjectFileError(e: ProtoValidationError): ProjectFileError {
  return {
    relativePath: e.relativePath,
    nodeId: e.nodeId || undefined,
    message: e.message,
  };
}

/** google.protobuf.Value -> the plain JS value ConfigField.default originally held (string/number/boolean/null/undefined — the only kinds any ConfigField.default ever produces server-side, see node-registry-flow.service.ts's toProtoValueInit). */
function fromProtoValue(value: ProtoConfigField["defaultValue"]): unknown {
  if (!value || value.kind.case === undefined) return undefined;
  switch (value.kind.case) {
    case "nullValue":
      return null;
    case "stringValue":
    case "numberValue":
    case "boolValue":
      return value.kind.value;
    default:
      // structValue/listValue: no ConfigField in the registry ever defaults to one of
      // these today; fall back to leaving it unset rather than guessing a shape.
      return undefined;
  }
}

function fromProtoPort(port: ProtoPortDefinition) {
  return { id: port.id, label: port.label, kind: port.kind === "" ? undefined : port.kind };
}

function fromProtoConfigField(field: ProtoConfigField) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options,
    default: fromProtoValue(field.defaultValue),
    hint: field.hint,
  };
}

/** NodeDefinition (proto) -> core's NodeDefinition shape, minus the non-serializable `emit`/`resultIdentifier` fields the wire format never carries (nodes.routes.ts's REST handler stripped these the same way before this migration — callers already only ever consumed the plain-data fields). */
function fromProtoNodeDefinition(def: ProtoNodeDefinition) {
  return {
    type: def.type,
    category: def.category,
    label: def.label,
    description: def.description,
    inputs: def.inputs.map(fromProtoPort),
    outputs: def.outputs.map(fromProtoPort),
    configSchema: def.configSchema.map(fromProtoConfigField),
  };
}

/** FileTreeNode (proto, `Kind` enum) -> this module's local FileTreeNode discriminated union (`type: "file" | "folder"`). */
function fromProtoFileTreeNode(n: ProtoFileTreeNode): FileTreeNode {
  if (n.kind === FileTreeNode_Kind.FOLDER) {
    return {
      type: "folder",
      name: n.name,
      relativePath: n.relativePath,
      children: n.children.map(fromProtoFileTreeNode),
    };
  }
  return { type: "file", name: n.name, relativePath: n.relativePath };
}

export interface NodeRegistryResult {
  definitions: NodeDefinition[];
  projectDir: string;
}

export async function fetchNodeRegistry(scope?: string): Promise<NodeRegistryResult> {
  const res = await client.getNodeRegistry({ scope: scope ?? "" });
  return {
    definitions: res.definitions.map(fromProtoNodeDefinition) as unknown as NodeDefinition[],
    projectDir: res.projectDir,
  };
}

export async function fetchFlow(): Promise<Flow | null> {
  const res = await client.getFlow({});
  if (!res.found) return null;
  return decodeFlow(res.flatbufferFlow);
}

export async function saveFlow(flow: Flow): Promise<void> {
  await client.saveFlow({ flatbufferFlow: encodeFlow(flow) });
}

export interface ValidateResult {
  valid: boolean;
  errors: ValidationError[];
}

export async function validateFlowRemote(flow: Flow): Promise<ValidateResult> {
  const res = await client.validateFlow({ flatbufferFlow: encodeFlow(flow) });
  return { valid: res.valid, errors: res.errors.map(fromProtoValidationError) };
}

export type GenerateResult = { valid: true; code: string } | { valid: false; errors: ValidationError[] };

export async function generateCode(flow: Flow): Promise<GenerateResult> {
  const res = await client.generateCode({ flatbufferFlow: encodeFlow(flow) });
  if (!res.valid) return { valid: false, errors: res.errors.map(fromProtoValidationError) };
  return { valid: true, code: res.code };
}

export type WriteResult = { written: true; path: string } | { valid: false; errors: ValidationError[] };

export async function writeToDisk(flow: Flow): Promise<WriteResult> {
  const res = await client.writeGeneratedCode({ flatbufferFlow: encodeFlow(flow) });
  if (!res.valid) return { valid: false, errors: res.errors.map(fromProtoValidationError) };
  return { written: true, path: res.path };
}

export type StartServerResult =
  | { running: true }
  | { valid: false; errors: ProjectFileError[] }
  | { error: string };

/**
 * Compiles and writes the whole project from disk, then runs whichever file has the
 * "express.listen" node — same multi-file pipeline as `compileProject`/`writeProjectToDisk`,
 * not a lone in-memory flow. Takes no `flow` argument for that reason: it always reflects
 * what's saved to disk, matching how Compile already behaves.
 */
export async function getProjectSettings(): Promise<ProjectSettings> {
  const res = await client.getProjectSettings({});
  return {
    mode: res.settings?.mode as "server" | "script",
    entryFile: res.settings?.entryFile || undefined,
  };
}

export async function updateProjectSettings(settings: ProjectSettings): Promise<{ ok: boolean; errors: string[] }> {
  const res = await client.updateProjectSettings({
    settings: {
      mode: settings.mode,
      entryFile: settings.entryFile || "",
    },
  });
  return { ok: res.ok, errors: res.errors };
}

export async function startServer(targetFile?: string): Promise<StartServerResult> {
  const res = await client.startRun({ targetFile: targetFile || "" });
  switch (res.result.case) {
    case "started":
      return { running: true };
    case "validationFailure":
      return { valid: false, errors: res.result.value.errors.map(fromProtoProjectFileError) };
    case "error":
      return { error: res.result.value };
    default:
      throw new Error("StartRun response had no recognized result");
  }
}

export async function stopServer(): Promise<void> {
  await client.stopRun({});
}

export async function fetchRunStatus(): Promise<{ running: boolean }> {
  const res = await client.getRunStatus({});
  return { running: res.running };
}

/**
 * Subscribes to the running server's live logs. Was Server-Sent Events over an
 * `EventSource`; now a Connect server-streaming RPC consumed via an async-iterable
 * `for await` loop. The external contract is unchanged: this function still returns a
 * synchronous close function immediately (it does not await the stream), and still
 * invokes `onLog`/`onExit` per event. The `for await` loop runs fire-and-forget, kicked
 * off but never awaited here; closing early via the returned function aborts the
 * underlying `AbortController`, which makes the loop throw — that abort-triggered
 * throw is expected (not a bug) and is swallowed.
 */
export function subscribeToServerLogs(onLog: (line: string) => void, onExit: (code: number | null) => void): () => void {
  const controller = new AbortController();

  (async () => {
    try {
      for await (const res of client.runLogs({}, { signal: controller.signal })) {
        if (res.event.case === "log") {
          onLog(res.event.value);
        } else if (res.event.case === "exit") {
          onExit(res.event.value.code ?? null);
        }
      }
    } catch {
      // Expected when close() aborts the controller mid-stream; nothing to surface.
    }
  })();

  return () => controller.abort();
}

export async function fetchFileTree(): Promise<FileTreeNode[]> {
  const res = await client.listFiles({});
  return res.tree.map(fromProtoFileTreeNode);
}

export async function createFolder(path: string): Promise<{ ok: true; path: string }> {
  const res = await client.createFolder({ path });
  return { ok: true, path: res.path };
}

export async function createBlueprint(path: string): Promise<{ ok: true; path: string; flow: Flow }> {
  const res = await client.createBlueprint({ path });
  return { ok: true, path: res.path, flow: decodeFlow(res.flatbufferFlow) };
}

export async function fetchBlueprint(path: string): Promise<Flow> {
  const res = await client.getBlueprint({ path });
  return decodeFlow(res.flatbufferFlow);
}

export async function saveBlueprint(path: string, flow: Flow): Promise<void> {
  await client.saveBlueprint({ path, flatbufferFlow: encodeFlow(flow) });
}

export async function renameFile(from: string, to: string): Promise<void> {
  await client.renamePath({ from, to });
}

export async function deleteFile(path: string): Promise<void> {
  await client.deletePath({ path });
}

export type CompileResult =
  | { valid: true; results: CompiledFile[] }
  | { valid: false; results: CompiledFile[]; errors: ProjectFileError[] };

export async function compileProject(): Promise<CompileResult> {
  const res = await client.compileProject({});
  const results: CompiledFile[] = res.results.map((f) => ({ relativePath: f.relativePath, code: f.code }));
  if (!res.valid) {
    return { valid: false, results, errors: res.errors.map(fromProtoProjectFileError) };
  }
  return { valid: true, results };
}

export type WriteProjectResult =
  | { written: true; files: WrittenFile[] }
  | { valid: false; errors: ProjectFileError[] };

export async function writeProjectToDisk(): Promise<WriteProjectResult> {
  const res = await client.writeCompiledProject({});
  if (!res.valid) {
    return { valid: false, errors: res.errors.map(fromProtoProjectFileError) };
  }
  return {
    written: true,
    files: res.files.map((f) => ({ relativePath: f.relativePath, outputPath: f.outputPath })),
  };
}

export interface FunctionGraphPreviewSuccess {
  ok: true;
  body: string;
}
export interface FunctionGraphPreviewFailure {
  ok: false;
  error: { message: string; blueprintNodeId?: string };
}
export type FunctionGraphPreviewResult = FunctionGraphPreviewSuccess | FunctionGraphPreviewFailure;

export interface InstallPluginResult {
  ok: boolean;
  type: string;
  relativePath: string;
  errors: string[];
}

/**
 * Uploads a plugin node spec (raw UTF-8 JSON bytes — see
 * packages/core/src/plugins/plugin-schema.ts) via the InstallPlugin RPC. Always resolves
 * to `{ ok, ... }` rather than throwing on an expected failure (malformed JSON, spec
 * validation errors, type collision) — same "expected failure modeled as response data"
 * pattern connect/plugins.service.ts documents for this RPC.
 */
export async function installPlugin(pluginJson: Uint8Array): Promise<InstallPluginResult> {
  const res = await client.installPlugin({ pluginJson });
  return { ok: res.ok, type: res.type, relativePath: res.relativePath, errors: res.errors };
}

export async function previewFunctionGraph(graph: {
  nodes: FlowNode[];
  edges: FlowEdge[];
  variables?: VariableDeclaration[];
}): Promise<FunctionGraphPreviewResult> {
  // PreviewFunctionGraphRequest.flatbuffer_flow is a full encoded Flow envelope even
  // though this call only ever cares about `.nodes`/`.edges`/`.variables` — encodeFlow()
  // requires a complete Flow to encode at all, so `meta`/`version` are filled with
  // placeholder values the server-side decoder discards for this one RPC (see
  // compile-function-graph.service.ts's PreviewFunctionGraph handler). `variables` rides
  // along under this same placeholder Flow's top-level field even though it's really the
  // function graph's own scoped list — the server-side handler is what actually treats it
  // as `graph.variables` for this RPC (see docs/phase10-variables-plan.md).
  const placeholderFlow: Flow = {
    version: "1",
    meta: { name: "function-graph-preview", target: "express" },
    nodes: graph.nodes,
    edges: graph.edges,
    variables: graph.variables ?? [],
  };
  const res = await client.previewFunctionGraph({ flatbufferFlow: encodeFlow(placeholderFlow) });
  switch (res.result.case) {
    case "body":
      return { ok: true, body: res.result.value };
    case "error":
      return {
        ok: false,
        error: {
          message: res.result.value.message,
          blueprintNodeId: res.result.value.blueprintNodeId || undefined,
        },
      };
    default:
      throw new Error("PreviewFunctionGraph response had no recognized result");
  }
}
