/**
 * HTTP server entry point — starts the SIJIL Express backend.
 */
import app from "./app";
import { env } from "./config/env";
import { startAnchorWorker, stopAnchorWorker } from "./services/anchor-worker.service";

const server = app.listen(env.PORT, () => {
  console.log(`[SIJIL Backend] Running on http://localhost:${env.PORT}`);
  console.log(`[SIJIL Backend] API base: http://localhost:${env.PORT}/api`);
  console.log(`[SIJIL Backend] Environment: ${env.NODE_ENV}`);
  startAnchorWorker();
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[SIJIL Backend] Port ${env.PORT} is already in use`);
    process.exit(1);
  }
  throw err;
});

process.on("SIGTERM", () => {
  stopAnchorWorker();
  server.close(() => process.exit(0));
});
