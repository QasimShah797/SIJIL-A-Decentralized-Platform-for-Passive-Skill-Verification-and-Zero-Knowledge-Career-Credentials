import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { createReadStream, existsSync, mkdirSync, copyFileSync } from "node:fs";
import { componentTagger } from "lovable-tagger";

const zkpFiles: Record<string, string> = {
  "/zkp/score-threshold-v1/score_threshold.wasm": "zkp-artifacts/score-threshold-v1/score_threshold.wasm",
  "/zkp/score-threshold-v1/score_threshold_final.zkey": "zkp-artifacts/score-threshold-v1/score_threshold_final.zkey",
  "/zkp/score-threshold-v1/verification_key.json": "zkp-artifacts/score-threshold-v1/verification_key.json",
  "/zkp/score-threshold-v1/hashes.json": "zkp-artifacts/score-threshold-v1/hashes.json",
};

function zkpArtifactPlugin(root: string): Plugin {
  const contentType: Record<string, string> = {
    ".wasm": "application/wasm",
    ".zkey": "application/octet-stream",
    ".json": "application/json",
  };
  return {
    name: "sijil-zkp-artifacts",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split("?")[0] ?? "";
        const relative = zkpFiles[pathname];
        if (!relative) return next();
        const filePath = path.join(root, relative);
        if (!existsSync(filePath)) return next();
        const extension = path.extname(filePath);
        res.setHeader("Content-Type", contentType[extension] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "public, max-age=3600");
        createReadStream(filePath).pipe(res);
      });
    },
    writeBundle(options) {
      const outDir = options.dir;
      if (!outDir) return;
      for (const [url, relative] of Object.entries(zkpFiles)) {
        const source = path.join(root, relative);
        if (!existsSync(source)) continue;
        const target = path.join(outDir, url);
        mkdirSync(path.dirname(target), { recursive: true });
        copyFileSync(source, target);
      }
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: [".app.github.dev", ".github.dev", "localhost"],
    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), zkpArtifactPlugin(__dirname), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
