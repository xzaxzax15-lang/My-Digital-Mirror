import { loadEnv } from "./config.js";
import { createApp, readEnvFile } from "./app.js";
import { Store } from "./db/store.js";
import { logInfo } from "./security.js";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

readEnvFile(path.join(projectRoot, ".env"));

const env = loadEnv();
const store = new Store(path.join(projectRoot, "data"));
store.ensureAdmin(env.ADMIN_USERNAME, env.ADMIN_PASSWORD);
logInfo("admin_ready", { username: env.ADMIN_USERNAME, note: "change default credentials in production" });

const app = createApp(env, store);

const server = app.listen(env.PORT, () => {
  logInfo("server_started", { port: env.PORT, env: env.NODE_ENV, ai: env.AI_PROVIDER });
});

// رسالة ودية عند انشغال المنفذ بدل التتبع الخام
server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n❌ المنفذ ${env.PORT} مستخدم من نسخة أخرى من الخادم تعمل الآن.`);
    console.error("   الحل على ويندوز (PowerShell):");
    console.error(`     netstat -ano | findstr :${env.PORT}      ← لمعرفة رقم العملية`);
    console.error(`     taskkill /F /PID <رقم-العملية>           ← لإيقافها`);
    console.error("   ثم أعد تشغيل npm start\n");
    process.exit(1);
  }
  throw err;
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    logInfo("server_stopping", { signal });
    server.close(() => {
      store.close();
      process.exit(0);
    });
  });
}
