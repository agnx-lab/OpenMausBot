#!/usr/bin/env node
/**
 * 场景：vite-dev 双进程启动器 — harness(:8799) + Vite(:5199)；stdout 留给父进程；子进程随本进程退出。
 * 用法：node omb-vite-dev-launcher.mjs [--port 8799] [--ui-port 5199]
 */
import { spawn } from "node:child_process";
import { access, constants as fsConstants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");

function parseArgs(argv) {
  let port = 8799;
  let uiPort = 5199;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--port" && next) {
      port = Number(next) || port;
      i += 1;
    } else if (arg === "--ui-port" && next) {
      uiPort = Number(next) || uiPort;
      i += 1;
    }
  }
  return { port, uiPort };
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

const cfg = parseArgs(process.argv.slice(2));
const serverEntry = path.join(repoRoot, "server", "index.ts");
const viteEntry = path.join(repoRoot, "node_modules", "vite", "bin", "vite.js");

if (!(await pathExists(serverEntry))) {
  console.error(`[omb-vite-dev] missing ${serverEntry}`);
  process.exit(1);
}
if (!(await pathExists(viteEntry))) {
  console.error(`[omb-vite-dev] missing vite；请 pnpm install`);
  process.exit(1);
}

/** 继承父 ensure 已白名单的 env；只覆盖端口相关键。 */
const env = {
  ...process.env,
  OMB_PORT: String(cfg.port),
  OMB_UI_PORT: String(cfg.uiPort),
};
delete env.OMB_STATIC_DIR;

const children = [];

function spawnChild(command, args, label) {
  const child = spawn(command, args, {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code, signal) => {
    console.error(`[omb-vite-dev] ${label} exited code=${code} signal=${signal}`);
    for (const c of children) {
      if (c !== child && !c.killed) {
        try {
          c.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    }
    process.exit(code ?? 1);
  });
  return child;
}

spawnChild(process.execPath, ["--experimental-strip-types", serverEntry], "harness");
spawnChild(process.execPath, [viteEntry, "--host", "127.0.0.1", "--port", String(cfg.uiPort)], "vite");

function shutdown() {
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// keep alive
await new Promise(() => {});
