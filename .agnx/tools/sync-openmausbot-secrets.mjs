#!/usr/bin/env node
/**
 * 场景：把 host.config 里的密钥同步进 OMB 数据目录 config.json。
 * 详情页只显示 configured；读 Agnx apps/data/<id>/config/<key>.json。
 * 用法：node sync-openmausbot-secrets.mjs [--data-dir <path>] [--agnx-home <path>]
 */
import { homedir } from "node:os";
import { access, constants as fsConstants, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const APP_ID = "openmausbot";
const CONFIG_KEY = "openmausbot-app-config";

function parseArgs(argv) {
  let dataDir = "";
  let agnxHome = process.env.AGNX_HOME || "";
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if ((arg === "--data-dir" || arg === "--dataDir") && next) {
      dataDir = String(next).trim();
      i += 1;
    } else if (arg === "--agnx-home" && next) {
      agnxHome = String(next).trim();
      i += 1;
    }
  }
  if (!agnxHome) {
    agnxHome = path.join(homedir(), ".agnx-dev");
  }
  return { dataDir, agnxHome };
}

async function pathExists(p) {
  try {
    await access(p, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

function hostConfigPath(agnxHome) {
  return path.join(agnxHome, "apps", "data", APP_ID, "config", `${CONFIG_KEY}.json`);
}

function normalizeHostConfig(raw) {
  const doc = raw && typeof raw === "object" ? raw : {};
  const pick = (value) => (typeof value === "string" ? value.trim() : "");
  return {
    dataDir: pick(doc.dataDir),
    composioKey: pick(doc.composioKey),
    boxApiKey: pick(doc.boxApiKey),
    ttsKey: pick(doc.ttsKey),
    fishAudioKey: pick(doc.fishAudioKey),
  };
}

function applySecrets(ombConfig, doc) {
  const next = ombConfig && typeof ombConfig === "object" ? { ...ombConfig } : {};
  if (doc.composioKey) {
    next.composio = { ...(next.composio || {}), apiKey: doc.composioKey };
  }
  if (doc.boxApiKey) {
    next.box = { ...(next.box || {}), token: doc.boxApiKey };
  }
  if (doc.ttsKey || doc.fishAudioKey) {
    next.tts = { ...(next.tts || {}) };
    if (doc.ttsKey) {
      next.tts.key = doc.ttsKey;
    }
    if (doc.fishAudioKey) {
      next.tts.fishKey = doc.fishAudioKey;
    }
  }
  return next;
}

async function main() {
  const cfg = parseArgs(process.argv.slice(2));
  const configPath = hostConfigPath(cfg.agnxHome);
  const raw = (await pathExists(configPath)) ? await readJson(configPath) : null;
  const doc = normalizeHostConfig(raw);

  const dataDir = doc.dataDir || cfg.dataDir || path.join(homedir(), ".openmausbot");
  await mkdir(dataDir, { recursive: true });
  const ombConfigPath = path.join(dataDir, "config.json");
  const existing = (await readJson(ombConfigPath)) || {};
  const merged = applySecrets(existing, doc);
  await writeFile(ombConfigPath, `${JSON.stringify(merged, null, 2)}\n`, "utf8");

  const envSnap = path.join(repoRoot, ".agnx-openmausbot-runtime", "secret-env.json");
  await mkdir(path.dirname(envSnap), { recursive: true });
  const envPayload = {};
  if (doc.composioKey) {
    envPayload.COMPOSIO_API_KEY = doc.composioKey;
  }
  if (doc.boxApiKey) {
    envPayload.BOX_TOKEN = doc.boxApiKey;
  }
  if (doc.ttsKey) {
    envPayload.OMB_TTS_KEY = doc.ttsKey;
  }
  if (doc.fishAudioKey) {
    envPayload.OMB_FISH_AUDIO_API_KEY = doc.fishAudioKey;
  }
  await writeFile(envSnap, `${JSON.stringify(envPayload, null, 2)}\n`, "utf8");

  console.log(
    JSON.stringify({
      ok: true,
      dataDir,
      configPath,
      ombConfigPath,
      configured: {
        composio: Boolean(doc.composioKey),
        box: Boolean(doc.boxApiKey),
        tts: Boolean(doc.ttsKey),
        fish: Boolean(doc.fishAudioKey),
      },
    }),
  );
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
