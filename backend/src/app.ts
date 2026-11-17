/**
 * Express application setup — middleware, routes, and error handlers.
 */
import { randomUUID } from "node:crypto";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { env } from "./config/env";
import apiRoutes from "./routes/index";
import { errorMiddleware } from "./middleware/error.middleware";
import { notFoundMiddleware } from "./middleware/notFound.middleware";

const app = express();

app.set("trust proxy", env.TRUST_PROXY);

app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean),
  credentials: true,
}));
app.use((req: Request, res: Response, next: NextFunction) => {
  const incoming = req.header("x-request-id");
  const requestId = incoming && incoming.length <= 80 ? incoming : randomUUID();
  res.setHeader("x-request-id", requestId);
  next();
});
app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => {
  res.json({
    success: true,
    message: "SIJIL API is running. Open the app in the browser, not this URL.",
    app: env.FRONTEND_URL,
    api: `http://localhost:${env.PORT}/api`,
    health: `http://localhost:${env.PORT}/api/health`,
  });
});

app.use("/api", apiRoutes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export default app;
