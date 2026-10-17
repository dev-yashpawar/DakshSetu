import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";
import net from "node:net";
try {
  process.loadEnvFile(resolve("server/.env"));
} catch {}
if (process.env.MONGODB_URI) {
  console.log("Using configured MongoDB. No local database process needed.");
  setInterval(() => {}, 60000);
} else {
  const listening = await new Promise((resolve) => {
    const socket = net.connect(27027, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
  if (listening) {
    console.log("Using MongoDB already listening on port 27027.");
    setInterval(() => {}, 60000);
  } else {
    const windowsPath = "C:/Program Files/MongoDB/Server/8.0/bin/mongod.exe";
    const binary =
      process.env.MONGOD_PATH ||
      (existsSync(windowsPath) ? windowsPath : "mongod");
    const data = resolve("server/data/mongo");
    mkdirSync(data, { recursive: true });
    const child = spawn(
      binary,
      [
        "--dbpath",
        data,
        "--bind_ip",
        "127.0.0.1",
        "--port",
        "27027",
        "--quiet",
        "--logpath",
        resolve("server/data/mongod.log"),
      ],
      { stdio: "inherit", windowsHide: true },
    );
    child.on("error", () => {
      console.error(
        "MongoDB was not found. Set MONGOD_PATH or configure server/.env MONGODB_URI.",
      );
      process.exit(1);
    });
    child.on("exit", (code) => process.exit(code ?? 0));
    for (const signal of ["SIGINT", "SIGTERM"])
      process.on(signal, () => child.kill(signal));
  }
}
