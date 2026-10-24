#!/usr/bin/env node
/**
 * 场景：短跑 sidecar — 确保本仓 OpenMausBot harness 已起（默认 packaged 静态托管）。
 * 用法：node .agnx/tools/ensure-openmausbot.mjs [--port <n>] [--ui-mode packaged|vite-dev] [--data-dir <path>] [--force-restart] [--supervised]
 * stdout：单行 JSON { ok, port, origin, reused, uiMode, warnings? }；--supervised 时含 plan 供 daemon spawn
 */
import { spawn, execFile } from "node:child_process";
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** clone 根 = openmausbot 仓根 */
const repoRoot = path.resolve(__dirname, "../..");
const defaultPort = 8799;
const defaultUiPort = 5199;

function parseArgs(argv) {
  let workDir = process.env.AGNX_APP_DATA_ROOT || "";
  let port = defaultPort;
  let uiMode = "packaged";
  let dataDir = "";
  let forceRestart = false;
  let supervised = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--work-dir" || arg === "--workDir") && next) {
      workDir = String(next).trim();
      i += 1;
    } else if (arg === "--port" && next) {
      const n = Number(next);
      if (Number.isFinite(n) && n > 0) {
        port = n;
      }
      i += 1;
    } else if ((arg === "--ui-mode" || arg === "--uiMode") && next) {
      uiMode = next === "vite-dev" ? "vite-dev" : "packaged";
      i += 1;
    } else if ((arg === "--data-dir" || arg === "--dataDir") && next) {
      dataDir = String(next).trim();
      i += 1;
    } else if (arg === "--force-restart" || arg === "--forceRestart") {
      forceRestart = true;
    } else if (arg === "--supervised") {
      supervised = true;
    }
  }
  // supervised：必须写 AGNX_APP_DATA_ROOT（daemon 注入 apps/data/<appId>）；禁止退回仓内 runtime。
  // 非 supervised：本地开发可退回 .agnx-openmausbot-runtime。
  const fallbackWorkDir = path.join(repoRoot, ".agnx-openmausbot-runtime");
  return {
    workDir: workDir || (supervised ? "" : fallbackWorkDir),
    port,
    uiMode,
    dataDir,
    repoRoot,
    forceRestart,
    supervised,
  };
}

function nodeMajor() {
  const m = Number(String(process.versions.node).split(".")[0]);
  return Number.isFinite(m) ? m : 0;
}

function fingerprint(cfg) {
  return JSON.stringify({
    repoRoot: cfg.repoRoot,
    port: cfg.port,
    uiMode: cfg.uiMode,
    dataDir: cfg.dataDir || "",
  });
}

async function pathExists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readState(statePath) {
  try {
    const raw = await readFile(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function writeState(statePath, payload) {
  await writeFile(statePath, JSON.stringify(payload, null, 2), "utf8");
}

function httpGetOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2500 }, (res) => {
      res.resume();
      resolve(res.statusCode != null && res.statusCode >= 200 && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function isWebHealthy(port) {
  if (await httpGetOk(`http://127.0.0.1:${port}/api/health`)) {
    return true;
  }
  return httpGetOk(`http://127.0.0.1:${port}/`);
}

async function waitForHealth(port, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await isWebHealthy(port)) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function stopPid(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) {
    return;
  }
  try {
    process.kill(n, "SIGTERM");
  } catch {
    // ignore
  }
}

function guestOrigin(cfg) {
  if (cfg.uiMode === "vite-dev") {
    return `http://127.0.0.1:${defaultUiPort}/`;
  }
  return `http://127.0.0.1:${cfg.port}/`;
}

function healthUrlFor(cfg) {
  const port = cfg.uiMode === "vite-dev" ? defaultUiPort : cfg.port;
  return `http://127.0.0.1:${port}/`;
}

async function loadSecretEnvSnapshot() {
  const snap = path.join(repoRoot, ".agnx-openmausbot-runtime", "secret-env.json");
  try {
    const raw = JSON.parse(await readFile(snap, "utf8"));
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

/** 只传 sidecar 必需环境；禁止把整份 process.env（含本机 API 密钥）写进 plan stdout。 */
function baseSidecarEnv() {
  const keep = [
    "PATH",
    "HOME",
    "USER",
    "LOGNAME",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "SHELL",
    "TERM",
    "NODE_OPTIONS",
    "NODE_PATH",
    "NVM_BIN",
    "NVM_DIR",
    "SSH_AUTH_SOCK",
  ];
  const env = {};
  for (const key of keep) {
    if (typeof process.env[key] === "string" && process.env[key]) {
      env[key] = process.env[key];
    }
  }
  // 可选：显式 OMB_* / COMPOSIO / BOX / TTS（用户或 sync 已写入 process.env 时）
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value !== "string" || !value) {
      continue;
    }
    if (
      key.startsWith("OMB_") ||
      key === "COMPOSIO_API_KEY" ||
      key === "BOX_TOKEN" ||
      key === "XAI_API_KEY"
    ) {
      env[key] = value;
    }
  }
  return env;
}

async function buildEnv(cfg) {
  const secrets = await loadSecretEnvSnapshot();
  const env = {
    ...baseSidecarEnv(),
    ...secrets,
    OMB_PORT: String(cfg.port),
  };
  if (cfg.dataDir) {
    env.OMB_DATA_DIR = cfg.dataDir;
  }
  if (cfg.uiMode === "packaged") {
    env.OMB_STATIC_DIR = path.join(cfg.repoRoot, "dist");
  } else {
    delete env.OMB_STATIC_DIR;
  }
  return env;
}

async function ensureUiBuilt(cfg, warnings) {
  const indexHtml = path.join(cfg.repoRoot, "dist", "index.html");
  if (await pathExists(indexHtml)) {
    return { ok: true };
  }
  warnings.push("dist/index.html 缺失，正在 pnpm build…");
  try {
    await execFileAsync("pnpm", ["run", "build"], {
      cwd: cfg.repoRoot,
      env: process.env,
      timeout: 600_000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stderr =
      error && typeof error === "object" && "stderr" in error ? String(error.stderr || "") : "";
    return {
      ok: false,
      error: `pnpm build 失败：${(stderr || msg).slice(0, 500)}`,
    };
  }
  if (!(await pathExists(indexHtml))) {
    return { ok: false, error: "pnpm build 后仍无 dist/index.html" };
  }
  return { ok: true };
}

async function syncSecretsFromHostConfig(cfg) {
  const syncScript = path.join(__dirname, "sync-openmausbot-secrets.mjs");
  if (!(await pathExists(syncScript))) {
    return;
  }
  const args = [syncScript];
  if (cfg.dataDir) {
    args.push("--data-dir", cfg.dataDir);
  }
  try {
    await execFileAsync(process.execPath, args, {
      cwd: cfg.repoRoot,
      timeout: 30_000,
      maxBuffer: 512 * 1024,
      env: process.env,
    });
  } catch {
    // non-fatal; detail UI will surface sync errors
  }
}

async function tryReusedResponse(cfg, statePath, wantedFp) {
  if (cfg.forceRestart) {
    return null;
  }
  const originPort = cfg.uiMode === "vite-dev" ? defaultUiPort : cfg.port;
  if (!(await isWebHealthy(originPort))) {
    return null;
  }
  // packaged also needs harness health on harness port
  if (cfg.uiMode === "vite-dev" && !(await isWebHealthy(cfg.port))) {
    return null;
  }
  const existing = await readState(statePath);
  if (existing?.fingerprint && existing.fingerprint !== wantedFp) {
    return null;
  }
  return {
    ok: true,
    reused: true,
    port: cfg.port,
    origin: guestOrigin(cfg),
    uiMode: cfg.uiMode,
    pid: existing?.pid ?? null,
    fingerprint: wantedFp,
  };
}

async function buildSupervisedPlan(cfg, warnings, wantedFp) {
  if (nodeMajor() < 24) {
    return {
      ok: false,
      error: `OpenMausBot 需要 Node ≥ 24（当前 ${process.versions.node}）。请 nvm use 24 后重试。`,
    };
  }
  const serverEntry = path.join(cfg.repoRoot, "server", "index.ts");
  if (!(await pathExists(serverEntry))) {
    return { ok: false, error: `找不到 harness：${serverEntry}` };
  }
  if (!(await pathExists(path.join(cfg.repoRoot, "node_modules")))) {
    return {
      ok: false,
      error: "缺少 node_modules。请在仓根执行：corepack enable && pnpm install（Node ≥ 24）",
    };
  }

  await syncSecretsFromHostConfig(cfg);

  if (cfg.uiMode === "packaged") {
    const built = await ensureUiBuilt(cfg, warnings);
    if (!built.ok) {
      return built;
    }
    const healthUrl = `http://127.0.0.1:${cfg.port}/api/health`;
    return {
      ok: true,
      plan: {
        command: process.execPath,
        args: ["--experimental-strip-types", serverEntry],
        cwd: cfg.repoRoot,
        env: await buildEnv(cfg),
        fingerprint: wantedFp,
        healthUrl,
        port: cfg.port,
        launchMode: "packaged",
        guestOrigin: guestOrigin(cfg),
      },
    };
  }

  // vite-dev：单 plan 跑 launcher（内部起 harness + vite）
  const launcher = path.join(__dirname, "omb-vite-dev-launcher.mjs");
  if (!(await pathExists(launcher))) {
    return { ok: false, error: `找不到 vite-dev launcher：${launcher}` };
  }
  const healthUrl = `http://127.0.0.1:${defaultUiPort}/`;
  return {
    ok: true,
    plan: {
      command: process.execPath,
      args: [launcher, "--port", String(cfg.port), "--ui-port", String(defaultUiPort)],
      cwd: cfg.repoRoot,
      env: await buildEnv(cfg),
      fingerprint: wantedFp,
      healthUrl,
      port: defaultUiPort,
      launchMode: "vite-dev",
      guestOrigin: guestOrigin(cfg),
    },
  };
}

async function ensureLocal(cfg, warnings, statePath, wantedFp) {
  const planned = await buildSupervisedPlan(cfg, warnings, wantedFp);
  if (!planned.ok) {
    return planned;
  }
  const existing = await readState(statePath);
  if (existing?.pid) {
    stopPid(existing.pid);
  }
  const plan = planned.plan;
  const child = spawn(plan.command, plan.args, {
    cwd: plan.cwd,
    env: plan.env || (await buildEnv(cfg)),
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  const originPort = cfg.uiMode === "vite-dev" ? defaultUiPort : cfg.port;
  const ready = await waitForHealth(originPort, 240_000);
  if (!ready) {
    stopPid(child.pid);
    return {
      ok: false,
      error: `OpenMausBot 启动超时（uiMode=${cfg.uiMode}, port=${originPort}）`,
      pid: child.pid ?? null,
    };
  }
  await writeState(statePath, {
    pid: child.pid ?? null,
    fingerprint: wantedFp,
    port: cfg.port,
    uiMode: cfg.uiMode,
    updatedAt: new Date().toISOString(),
  });
  return {
    ok: true,
    reused: false,
    port: cfg.port,
    origin: guestOrigin(cfg),
    uiMode: cfg.uiMode,
    pid: child.pid ?? null,
    fingerprint: wantedFp,
  };
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const warnings = [];

  if (cfg.supervised && !cfg.workDir) {
    console.log(
      JSON.stringify({
        ok: false,
        error:
          "supervised ensure 需要 AGNX_APP_DATA_ROOT（或 --work-dir）指向 apps/data/<appId>；禁止写入仓内 .agnx-openmausbot-runtime",
      }),
    );
    process.exitCode = 1;
    return;
  }

  await mkdir(cfg.workDir, { recursive: true });
  if (cfg.dataDir) {
    await mkdir(cfg.dataDir, { recursive: true });
  }
  const statePath = path.join(cfg.workDir, "openmausbot.json");
  const wantedFp = fingerprint(cfg);

  if (cfg.forceRestart) {
    const existing = await readState(statePath);
    if (existing?.pid) {
      stopPid(existing.pid);
    }
  }

  if (cfg.supervised) {
    const reused = await tryReusedResponse(cfg, statePath, wantedFp);
    if (reused) {
      console.log(
        JSON.stringify({
          ...reused,
          healthUrl: healthUrlFor(cfg),
          warnings,
        }),
      );
      return;
    }
    const planned = await buildSupervisedPlan(cfg, warnings, wantedFp);
    if (!planned.ok) {
      console.log(JSON.stringify({ ...planned, repoRoot: cfg.repoRoot, uiMode: cfg.uiMode, warnings }));
      process.exitCode = 1;
      return;
    }
    console.log(
      JSON.stringify({
        ok: true,
        reused: false,
        plan: planned.plan,
        origin: guestOrigin(cfg),
        port: cfg.port,
        uiMode: cfg.uiMode,
        warnings,
        repoRoot: cfg.repoRoot,
      }),
    );
    return;
  }

  const reused = await tryReusedResponse(cfg, statePath, wantedFp);
  if (reused) {
    console.log(JSON.stringify({ ...reused, warnings }));
    return;
  }
  const result = await ensureLocal(cfg, warnings, statePath, wantedFp);
  console.log(JSON.stringify({ ...result, warnings, repoRoot: cfg.repoRoot }));
  if (!result.ok) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.log(
    JSON.stringify({
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    }),
  );
  process.exitCode = 1;
});
