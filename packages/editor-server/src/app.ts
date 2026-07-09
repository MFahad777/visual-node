import express, { type Express } from "express";
import cors from "cors";
import { expressConnectMiddleware } from "@connectrpc/connect-express";
import type { AppConfig } from "./config.js";
import { registerNodeRegistryFlowRoutes } from "./connect/node-registry-flow.service.js";
import { registerValidateGenerateRoutes } from "./connect/validate-generate.service.js";
import { registerRunRoutes } from "./connect/run.service.js";
import { registerFilesRoutes } from "./connect/files.service.js";
import { registerCompileFunctionGraphRoutes } from "./connect/compile-function-graph.service.js";
import { registerPluginsRoutes } from "./connect/plugins.service.js";
import { registerSettingsRoutes } from "./connect/settings.service.js";
import { serveStatic } from "./static.js";

export function buildApp(config: AppConfig): Express {
  const app = express();

  app.use(cors());

  // Buf Connect transport (gRPC / gRPC-Web / Connect protocol) — the only API surface as of
  // Phase 8; see docs/phase8-backend-grpc-flatbuffers-plan.md. The REST routes this replaced
  // (`routes/*.routes.ts`) were removed once parity was confirmed end-to-end. No
  // `express.json()` is mounted: Connect owns its own body parsing entirely, and nothing
  // else in this app reads `req.body`.
  //
  // All six service-group registrations share ONE router instance and use `router.rpc()`
  // per method (not `router.service()`), since `router.service()` fills every method the
  // service defines that's absent from its partial implementation with an "unimplemented"
  // stub — calling it more than once per service on a shared router would let a later
  // group's stub-fill silently overwrite an earlier group's real methods.
  app.use(
    expressConnectMiddleware({
      // editor-ui's dev server (vite.config.ts) only proxies "/api" to editor-server, and
      // its browser Connect client (src/api/client.ts) is configured with `baseUrl: "/api"`
      // to match — without this prefix, Connect requests would land at the Express app
      // root (e.g. "/visual_node.v1.EditorService/GetNodeRegistry") and never reach this
      // middleware through the dev proxy.
      requestPathPrefix: "/api",
      routes: (router) => {
        registerNodeRegistryFlowRoutes(router, config);
        registerValidateGenerateRoutes(router, config);
        registerSettingsRoutes(router, config);
        registerRunRoutes(router, config);
        registerFilesRoutes(router, config);
        registerCompileFunctionGraphRoutes(router, config);
        registerPluginsRoutes(router, config);
      },
    }),
  );

  serveStatic(app);

  return app;
}
