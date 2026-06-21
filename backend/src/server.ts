/**
 * HTTP server entry point — starts the SIJIL Express backend.
 */
import app from "./app";
import { env } from "./config/env";

const server = app.listen(env.PORT, () => {
  console.log(`[SIJIL Backend] Running on http://localhost:${env.PORT}`);
  console.log(`[SIJIL Backend] API base: http://localhost:${env.PORT}/api`);
  console.log(`[SIJIL Backend] Environment: ${env.NODE_ENV}`);
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
