import path from "node:path";
import type { ConnectRouter, HandlerContext } from "@connectrpc/connect";
import { EditorService } from "@visual-node/proto-gen";
import {
  collectProjectDependencies,
  writeGeneratedFile,
  type ProjectFileError,
  type ValidationError,
} from "@visual-node/core";
import type { AppConfig } from "../config.js";
import {
  compileProjectFromDisk,
  ensureCommonJsPackageJson,
  findEntryFile,
  nodeModulesInstalled,
} from "../codegen-helpers.js";
import { serverRunner } from "../runner.js";

/**
 * Connect RPC mirror of packages/editor-server/src/routes/run.routes.ts's four
 * `/api/run/*` endpoints, reusing the exact same helpers (`compileProjectFromDisk`,
 * `findEntryFile`, `ensureCommonJsPackageJson`, `nodeModulesInstalled`) and the same
 * `serverRunner` singleton — this is a transport-only rewrite, not a behavior change.
 *
 * Deliberately no explicit `MessageInitShape`/proto type imports here: every RPC
 * implementation below is passed to `router.rpc(EditorService.method.x, handler)`
 * individually (NOT one `router.service(EditorService, {...})` call — see note below),
 * so TypeScript contextually types each method's parameters and return value from
 * `EditorService`'s own descriptor. That sidesteps importing anything from
 * "@bufbuild/protobuf" directly, which this package cannot resolve on its own (it's only
 * a transitive dependency here, reachable through `@visual-node/proto-gen`'s and
 * `@connectrpc/connect`'s own node_modules, not this package's) — `@visual-node/proto-gen`'s
 * generated `.d.ts` resolves it fine from its own directory, but a direct
 * `import ... from "@bufbuild/protobuf"` written in this file would not resolve under
 * pnpm's strict per-package node_modules.
 *
 * NOTE on `router.rpc()` vs `router.service()`: `router.service(EditorService, partial)`
 * fills every method of `EditorService` NOT present in `partial` with an "unimplemented"
 * stub handler and registers all of them (real + stubs) on the router. Since several other
 * files in `src/connect/` also register a subset of `EditorService`'s methods on the same
 * shared router, calling `.service()` here too would push "unimplemented" stubs for every
 * RPC this file doesn't own — and `connect-express`'s middleware keys its route table by
 * path in a plain `Map`, so whichever registration call runs last for a given path wins,
 * silently clobbering another file's real implementation. `router.rpc()` registers exactly
 * one method per call with no such fill-in behavior, which is what safely composes multiple
 * per-group registration functions on one router.
 */

/** Mirrors packages/core's ValidationError/ProjectFileError shapes into the proto ValidationError init shape (proto3 strings default to "", not undefined, for absent optional fields). */
function toProtoValidationError(err: ValidationError | ProjectFileError) {
  return {
    nodeId: err.nodeId ?? "",
    blueprintNodeId: err.blueprintNodeId ?? "",
    message: err.message,
    relativePath: "relativePath" in err ? err.relativePath : "",
  };
}

export function registerRunRoutes(router: ConnectRouter, config: AppConfig): ConnectRouter {
  /**
   * Mirrors POST /api/run/start. The REST route's three failure shapes collapse into
   * StartRunResponse's `result` oneof: 422 (invalid project) -> `validationFailure`
   * (structured errors), 400 (no/multiple entry file) and 409 (deps not installed) ->
   * the generic `error` string variant, success -> `started`.
   */
  async function startRun() {
    const { sourceFiles, result } = await compileProjectFromDisk(config.projectDir);
    if (!result.valid) {
      return { result: { case: "validationFailure" as const, value: { errors: result.errors.map(toProtoValidationError) } } };
    }

    const entry = findEntryFile(sourceFiles);
    if ("error" in entry) {
      return { result: { case: "error" as const, value: entry.error } };
    }
    const entryIndex = sourceFiles.indexOf(entry);
    const entryOutputPath = result.files[entryIndex].relativePath;

    for (const file of result.files) {
      await writeGeneratedFile(path.join(config.projectDir, file.relativePath), file.code);
    }
    const { dependencies } = collectProjectDependencies(sourceFiles);
    await ensureCommonJsPackageJson(config.projectDir, path.basename(config.projectDir) || "flowserver-app", {
      dependencies,
    });

    const { installed, missing } = await nodeModulesInstalled(config.projectDir);
    if (!installed) {
      return {
        result: {
          case: "error" as const,
          value: `Dependencies not installed (missing: ${missing.join(", ")}). Run "npm install" in ${config.projectDir}, then try again.`,
        },
      };
    }

    const serverPath = path.join(config.projectDir, entryOutputPath);
    await serverRunner.start(config.projectDir, serverPath);
    return { result: { case: "started" as const, value: { running: true } } };
  }

  /** Mirrors POST /api/run/stop. */
  async function stopRun() {
    await serverRunner.stop();
    return { running: false };
  }

  /** Mirrors GET /api/run/status. */
  async function getRunStatus() {
    return { running: serverRunner.running };
  }

  /**
   * Mirrors GET /api/run/logs (SSE): replays up to 500 buffered lines, then streams
   * live "log"/"exit" events off `serverRunner`'s EventEmitter as they happen, forever
   * (mirroring the SSE route, which never closes the connection itself — only the
   * client disconnecting ends it).
   *
   * Cancellation: a Connect server-streaming handler's second argument is a
   * `HandlerContext` whose `signal: AbortSignal` fires when the client disconnects or
   * the call otherwise ends — this is the Connect-idiomatic replacement for the SSE
   * route's `req.on("close", ...)`. We listen for `context.signal`'s "abort" event to
   * unblock the generator's wait-for-next-event promise, and unregister the
   * `serverRunner` "log"/"exit" listeners in a `finally` block so cleanup also runs
   * when the consumer stops pulling and the generator is `.return()`-ed instead of
   * aborted (the two ways this loop can end).
   */
  async function* runLogs(_req: unknown, context: HandlerContext) {
    for (const line of serverRunner.getBufferedLogs()) {
      yield { event: { case: "log" as const, value: line } };
    }

    type QueuedEvent = { event: { case: "log"; value: string } | { case: "exit"; value: { code?: number } } };
    const queue: QueuedEvent[] = [];
    let wake: (() => void) | null = null;
    let done = false;

    const push = (item: QueuedEvent) => {
      queue.push(item);
      if (wake) {
        const resolve = wake;
        wake = null;
        resolve();
      }
    };

    const onLog = (line: string) => push({ event: { case: "log", value: line } });
    const onExit = (code: number | null) => push({ event: { case: "exit", value: { code: code ?? undefined } } });
    const onAbort = () => {
      done = true;
      if (wake) {
        const resolve = wake;
        wake = null;
        resolve();
      }
    };

    serverRunner.on("log", onLog);
    serverRunner.on("exit", onExit);
    context.signal.addEventListener("abort", onAbort);

    try {
      while (!done) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }
        if (context.signal.aborted) break;
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      serverRunner.off("log", onLog);
      serverRunner.off("exit", onExit);
      context.signal.removeEventListener("abort", onAbort);
    }
  }

  router.rpc(EditorService.method.startRun, startRun);
  router.rpc(EditorService.method.stopRun, stopRun);
  router.rpc(EditorService.method.getRunStatus, getRunStatus);
  router.rpc(EditorService.method.runLogs, runLogs);

  return router;
}
