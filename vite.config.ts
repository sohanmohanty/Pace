/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";

/**
 * Serve the `api/` functions inside the Vite dev server, with the same Web
 * Request/Response shape Vercel runs in production. Also mounts `/callback`
 * for the Sign in with ChatGPT loopback redirect.
 */
function devApi(): Plugin {
  return {
    name: "pace-dev-api",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? "/";
        const isApi = url.startsWith("/api/");
        const isCallback = url === "/callback" || url.startsWith("/callback?");
        if (!isApi && !isCallback) return next();
        try {
          const pathname = url.split("?")[0];
          const file = isCallback
            ? "auth"
            : pathname.replace(/^\/api\//, "").split("/")[0];
          const mod = await server.ssrLoadModule(path.resolve(__dirname, "api", `${file}.ts`));
          const method = (req.method ?? "GET").toUpperCase();
          const handler = (mod[method] ?? mod.default) as ((r: Request) => Promise<Response>) | undefined;
          if (!handler) {
            res.statusCode = 405;
            res.end("Method not allowed");
            return;
          }
          const request = await toRequest(req);
          const response = await handler(request);
          await writeResponse(response, res);
        } catch (e) {
          server.config.logger.error(`[api] ${url}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
          res.statusCode = 500;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ error: "api_error", message: e instanceof Error ? e.message : String(e) }));
        }
      });
    }
  };
}

async function toRequest(req: IncomingMessage): Promise<Request> {
  const host = req.headers.host ?? "localhost";
  const url = `http://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (typeof v === "string") headers.set(k, v);
    else if (Array.isArray(v)) headers.set(k, v.join(", "));
  }
  const method = (req.method ?? "GET").toUpperCase();
  let body: Buffer | undefined;
  if (method !== "GET" && method !== "HEAD") {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    body = Buffer.concat(chunks);
  }
  return new Request(url, { method, headers, body: body ? new Uint8Array(body) : undefined });
}

async function writeResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((v, k) => res.setHeader(k, v));
  if (!response.body) {
    res.end();
    return;
  }
  const reader = response.body.getReader();
  const flush = (res as ServerResponse & { flush?: () => void }).flush;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
    if (typeof flush === "function") flush.call(res);
  }
  res.end();
}

export default defineConfig(({ mode }) => {
  // Make .env / .env.local visible to the dev API (Vite only exposes VITE_* to the client).
  const env = loadEnv(mode, process.cwd(), "");
  for (const k of ["OPENAI_API_KEY", "PACE_AI_MOCK", "PACE_MODEL", "PACE_AUTH_FILE"]) {
    if (env[k] && !process.env[k]) process.env[k] = env[k];
  }

  return {
    // Respect the PORT env var (used by preview tooling); default to 5173.
    server: { port: Number(process.env.PORT) || 5173, host: true },
    plugins: [
      react(),
      tailwindcss(),
      devApi(),
      VitePWA({
        // I use "prompt" registration so main.tsx controls when pending updates
        // apply. It waits for the tab to be hidden before requesting a reload.
        registerType: "prompt",
        includeAssets: ["favicon.ico", "favicon.svg", "icons/apple-touch-icon.png"],
        workbox: {
          // Never let the service worker answer for the API or the OAuth callback.
          navigateFallbackDenylist: [/^\/api\//, /^\/callback/]
        },
        manifest: {
          name: "Pace: a planner that plans around how you feel",
          short_name: "Pace",
          description:
            "A capacity-aware planner for students. Say how much you have today and get a plan that fits. Your tasks stay on your device.",
          theme_color: "#1a1c22",
          background_color: "#1a1c22",
          display: "standalone",
          start_url: "/",
          icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
            {
              src: "/icons/icon-maskable-512.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "maskable"
            }
          ]
        }
      })
    ],
    build: {
      target: "es2022",
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (/[\/]react-aria|[\/]react-stately|[\/]@react-aria|[\/]@react-stately|[\/]@internationalized|[\/]@react-types/.test(id)) return "aria";
            if (/[\/]motion|[\/]framer-motion/.test(id)) return "motion";
            if (/[\/]dexie/.test(id)) return "dexie";
            if (/[\/]zod/.test(id)) return "zod";
            if (/[\/]cmdk|[\/]@radix-ui/.test(id)) return "cmdk";
            if (/[\/]react-router/.test(id)) return "router";
            if (/[\/]react-dom|[\/]react[\/]|[\/]scheduler/.test(id)) return "react";
            return undefined;
          }
        }
      }
    },
    test: {
      environment: "node",
      include: ["src/tests/**/*.test.ts", "api/**/*.test.ts"]
    }
  };
});
