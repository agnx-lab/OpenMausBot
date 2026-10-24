// 场景：OpenMausBot 端口 / uiMode / dataDir / 密钥经 host.config 落盘；面板 ensure 与详情配置共用。
import type { WorkspaceAppConfigApi } from "@agnx-lab/app-sdk";
import {
  DEFAULT_OPENMAUSBOT_PORT,
  OPENMAUSBOT_APP_ID,
  OPENMAUSBOT_CONFIG_KEY,
  type OpenMausBotUiMode,
} from "./constants";

export interface OpenMausBotAppConfigDocument {
  version: 1;
  port: number;
  uiMode: OpenMausBotUiMode;
  /** 可选隔离数据根；空 = 上游默认 ~/.openmausbot。 */
  dataDir?: string;
  composioKey?: string;
  boxApiKey?: string;
  /** ElevenLabs / 通用 TTS key → OMB_TTS_KEY。 */
  ttsKey?: string;
  /** Fish Audio → OMB_FISH_AUDIO_API_KEY。 */
  fishAudioKey?: string;
}

export function defaultOpenMausBotAppConfigDocument(): OpenMausBotAppConfigDocument {
  return { version: 1, port: DEFAULT_OPENMAUSBOT_PORT, uiMode: "packaged" };
}

function normalizeUiMode(raw: unknown): OpenMausBotUiMode {
  return raw === "vite-dev" ? "vite-dev" : "packaged";
}

function normalizeSecret(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeDataDir(raw: unknown): string | undefined {
  if (typeof raw !== "string") {
    return undefined;
  }
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function normalizeOpenMausBotAppConfigDocument(
  raw: unknown,
): OpenMausBotAppConfigDocument {
  const defaults = defaultOpenMausBotAppConfigDocument();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }
  const doc = raw as Partial<OpenMausBotAppConfigDocument>;
  const port = Number(doc.port);
  const uiMode = normalizeUiMode(doc.uiMode);
  const dataDir = normalizeDataDir(doc.dataDir);
  const composioKey = normalizeSecret(doc.composioKey);
  const boxApiKey = normalizeSecret(doc.boxApiKey);
  const ttsKey = normalizeSecret(doc.ttsKey);
  const fishAudioKey = normalizeSecret(doc.fishAudioKey);
  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    return {
      ...defaults,
      uiMode,
      dataDir,
      composioKey,
      boxApiKey,
      ttsKey,
      fishAudioKey,
    };
  }
  return {
    version: 1,
    port: Math.floor(port),
    uiMode,
    dataDir,
    composioKey,
    boxApiKey,
    ttsKey,
    fishAudioKey,
  };
}

export function isOpenMausBotSecretConfigured(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

export function openMausBotConfigToEnsureArgs(
  cfg: OpenMausBotAppConfigDocument,
  options?: { forceRestart?: boolean },
): string[] {
  const args = ["--port", String(cfg.port), "--ui-mode", cfg.uiMode];
  if (cfg.dataDir) {
    args.push("--data-dir", cfg.dataDir);
  }
  if (options?.forceRestart) {
    args.push("--force-restart");
  }
  return args;
}

export async function loadOpenMausBotConfigFromHost(
  config: WorkspaceAppConfigApi | null | undefined,
): Promise<OpenMausBotAppConfigDocument> {
  if (!config?.get) {
    return defaultOpenMausBotAppConfigDocument();
  }
  try {
    const raw = await config.get({
      scope: "app",
      appId: OPENMAUSBOT_APP_ID,
      key: OPENMAUSBOT_CONFIG_KEY,
      defaultValue: null,
    });
    return normalizeOpenMausBotAppConfigDocument(raw);
  } catch {
    return defaultOpenMausBotAppConfigDocument();
  }
}

export async function saveOpenMausBotConfigToHost(
  config: WorkspaceAppConfigApi | null | undefined,
  patch: Partial<
    Pick<
      OpenMausBotAppConfigDocument,
      "port" | "uiMode" | "dataDir" | "composioKey" | "boxApiKey" | "ttsKey" | "fishAudioKey"
    >
  >,
): Promise<OpenMausBotAppConfigDocument> {
  const current = await loadOpenMausBotConfigFromHost(config);
  const merged: OpenMausBotAppConfigDocument = { ...current, ...patch };
  for (const key of ["composioKey", "boxApiKey", "ttsKey", "fishAudioKey", "dataDir"] as const) {
    if (patch[key] === "") {
      delete merged[key];
    }
  }
  const normalized = normalizeOpenMausBotAppConfigDocument(merged);
  if (!config?.set) {
    return normalized;
  }
  await config.set({
    scope: "app",
    appId: OPENMAUSBOT_APP_ID,
    key: OPENMAUSBOT_CONFIG_KEY,
    value: normalized,
  });
  return normalized;
}
