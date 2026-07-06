import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Code, ConnectError, type ConnectRouter } from "@connectrpc/connect";
import {
  FUNCTION_GRAPH_NODE_DEFINITIONS,
  FUNCTION_GRAPH_ONLY_TYPES,
  decodeFlow,
  encodeFlow,
  listNodeDefinitions,
  type ConfigField,
  type Flow,
  type NodeDefinition as CoreNodeDefinition,
  type PortDefinition as CorePortDefinition,
} from "@visual-node/core";
import { EditorService } from "@visual-node/proto-gen";
import type { AppConfig } from "../config.js";
import { isPlausibleFlow } from "../flow-shape.js";

// NOTE on message construction: handlers below return plain object literals shaped like
// the proto message's init shape (e.g. `{ found: true, flatbufferFlow: ... }`) rather than
// calling `@bufbuild/protobuf`'s `create()` themselves. `@bufbuild/protobuf` is only a
// *peer* dependency of `@connectrpc/connect` (not a direct dependency of
// `visual-node`'s package.json, which this task is not allowed to touch), so
// it isn't resolvable from this package's own imports. This is fine: Connect's own
// `invokeUnaryImplementation` (`@connectrpc/connect/dist/esm/protocol/normalize.js`) always
// runs every handler's return value through `create(method.output, returnValue)` internally
// before serializing, using its *own* bundled `@bufbuild/protobuf` — so a plain
// `MessageInitShape`-compatible object is exactly what a `UnaryImpl` is documented to
// return, no local `create()` call needed.

/** Converts a `ConfigField.default` (documented as "a string, number, boolean, or raw JS
 * source string for 'code' fields") into a `google.protobuf.Value` init shape — a plain
 * `{ kind: { case, value } }` oneof object, which Connect's internal `create()` call
 * normalizes into a real `Value` message just like every other nested field here.
 *
 * Typed `any` rather than importing `MessageInit<Value>`: `@bufbuild/protobuf` is not a
 * direct dependency of this package (see the NOTE above), so even a type-only import of it
 * is unresolvable here. The runtime shape is verified against
 * `@bufbuild/protobuf`'s `wkt/gen/google/protobuf/struct_pb.d.ts` `Value` oneof directly. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toProtoValueInit(value: unknown): any {
  if (value === undefined) return undefined;
  if (value === null) return { kind: { case: "nullValue", value: 0 } };
  if (typeof value === "string") return { kind: { case: "stringValue", value } };
  if (typeof value === "number") return { kind: { case: "numberValue", value } };
  if (typeof value === "boolean") return { kind: { case: "boolValue", value } };
  // Not expected per ConfigField.default's documented type, but fall back to a string
  // representation rather than dropping the value silently.
  return { kind: { case: "stringValue", value: JSON.stringify(value) } };
}

/** Mirrors nodes.routes.ts's `{ emit, ...rest }` destructure: strips the non-serializable
 * `emit`/`resultIdentifier` function fields before the definition crosses the wire. */
function toProtoPort(port: CorePortDefinition) {
  return { id: port.id, label: port.label, kind: port.kind ?? "" };
}

function toProtoConfigField(field: ConfigField) {
  return {
    key: field.key,
    label: field.label,
    type: field.type,
    options: field.options ?? [],
    defaultValue: toProtoValueInit(field.default),
    hint: field.hint ?? "",
  };
}

function toProtoNodeDefinition(def: CoreNodeDefinition) {
  return {
    type: def.type,
    category: def.category,
    label: def.label,
    description: def.description,
    inputs: def.inputs.map(toProtoPort),
    outputs: def.outputs.map(toProtoPort),
    configSchema: def.configSchema.map(toProtoConfigField),
  };
}

/**
 * Registers the `GetNodeRegistry`/`GetFlow`/`SaveFlow` RPCs from `EditorService` on a
 * `ConnectRouter`, matching the behavior of the existing REST handlers exactly:
 * - `GetNodeRegistry` mirrors `routes/nodes.routes.ts`'s `GET /api/node-registry`
 *   (including its `?scope=function-graph` branch).
 * - `GetFlow`/`SaveFlow` mirror `routes/flow.routes.ts`'s `GET`/`POST /api/flow` — same
 *   `<projectDir>/flow.json` path, same on-disk JSON storage format (Phase 8 hasn't cut
 *   storage over to FlatBuffers yet, only the RPC wire format). A `Flow` crossing the RPC
 *   boundary is carried as the wire's opaque `flatbuffer_flow` bytes field, converted via
 *   `@visual-node/core`'s `encodeFlow`/`decodeFlow`.
 */
export function registerNodeRegistryFlowRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  const flowPath = path.join(config.projectDir, "flow.json");

  router.rpc(EditorService.method.getNodeRegistry, async (req) => {
    // Plugin nodes are always shaped as either pure-value (no exec pins) or a single
    // exec-in("in")/exec-out("out") pair (validatePluginNodeSpec enforces this — see
    // Phase 9 notes in CLAUDE.md) — the same shape as the builtin operators/consoleLog/
    // customCode types already offered inside a function body. So unlike
    // FUNCTION_GRAPH_NODE_DEFINITIONS (a static list of builtins), plugins are appended
    // live from the mutable registry rather than hardcoded, since they're registered at
    // runtime via InstallPlugin and would otherwise never appear here.
    const definitions =
      req.scope === "function-graph"
        ? [
            ...FUNCTION_GRAPH_NODE_DEFINITIONS,
            ...listNodeDefinitions().filter((def) => def.type.startsWith("plugin.")),
          ]
        : listNodeDefinitions().filter((def) => !FUNCTION_GRAPH_ONLY_TYPES.has(def.type));

    return { definitions: definitions.map(toProtoNodeDefinition), projectDir: config.projectDir };
  });

  router.rpc(EditorService.method.getFlow, async () => {
    let raw: string;
    try {
      raw = await readFile(flowPath, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return { found: false };
      }
      throw err;
    }

    let flow: Flow;
    try {
      flow = JSON.parse(raw) as Flow;
    } catch (err) {
      throw new ConnectError(`flow.json is not valid JSON: ${(err as Error).message}`, Code.Internal);
    }

    let flatbufferFlow: Uint8Array;
    try {
      flatbufferFlow = encodeFlow(flow);
    } catch (err) {
      throw new ConnectError(`flow.json could not be encoded: ${(err as Error).message}`, Code.Internal);
    }

    return { found: true, flatbufferFlow };
  });

  router.rpc(EditorService.method.saveFlow, async (req) => {
    let flow: Flow;
    try {
      flow = decodeFlow(req.flatbufferFlow);
    } catch (err) {
      throw new ConnectError(`flatbuffer_flow could not be decoded: ${(err as Error).message}`, Code.InvalidArgument);
    }

    if (!isPlausibleFlow(flow)) {
      throw new ConnectError(
        "flatbuffer_flow must decode to a Flow with `nodes`, `edges`, and `meta`",
        Code.InvalidArgument,
      );
    }

    await mkdir(config.projectDir, { recursive: true });
    await writeFile(flowPath, JSON.stringify(flow, null, 2), "utf8");
    return { ok: true };
  });

  return router;
}
