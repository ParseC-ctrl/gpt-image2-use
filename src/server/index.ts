import express from "express";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createServer as createViteServer } from "vite";
import { createApiRouter, sendJsonError } from "./routes";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const port = Number(process.env.PORT || 5173);
const host = process.env.HOST || "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";

async function bootstrap() {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use("/api", createApiRouter(rootDir));
  app.use(sendJsonError);

  if (isProduction) {
    const clientDir = path.join(rootDir, "dist/client");
    if (!existsSync(clientDir)) {
      console.warn("未找到 dist/client，请先运行 npm run build。");
    }

    app.use(express.static(clientDir));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(clientDir, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      root: rootDir,
      server: {
        middlewareMode: true
      },
      appType: "spa"
    });

    app.use(vite.middlewares);
  }

  app.listen(port, host, () => {
    console.log(`Image2 chat app running at http://${host}:${port}`);
  }).on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(`端口 ${port} 已被占用。可以用 PORT=其它端口 npm run dev 启动。`);
    } else if (error.code === "EPERM") {
      console.error(`当前环境不允许监听 ${host}:${port}。请换一个端口，或在本机终端直接运行 npm run dev。`);
    } else {
      console.error(error);
    }
    process.exit(1);
  });
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
