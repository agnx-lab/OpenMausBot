// 场景：详情「配置」— 端口、uiMode、dataDir、密钥标志（W2）；RN + 主题 Chip。
import { createElement, useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { Text, TextInput, View, type TextStyle, type ViewStyle } from "react-native";
import { useUnistyles } from "react-native-unistyles";
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import {
  DEFAULT_OPENMAUSBOT_PORT,
  OPENMAUSBOT_APP_ID,
  OPENMAUSBOT_SYNC_SECRETS_TOOL_REL,
  type OpenMausBotUiMode,
} from "./constants";
import { getBoundHost } from "./host-bind";
import {
  defaultOpenMausBotAppConfigDocument,
  isOpenMausBotSecretConfigured,
  loadOpenMausBotConfigFromHost,
  saveOpenMausBotConfigToHost,
  type OpenMausBotAppConfigDocument,
} from "./openmausbot-config";
import { notifyOpenMausBotRuntimeNeedsRestart } from "./openmausbot-runtime-coordinator";

let cachedConfig: OpenMausBotAppConfigDocument = defaultOpenMausBotAppConfigDocument();

export function getCachedOpenMausBotConfig(): OpenMausBotAppConfigDocument {
  return cachedConfig;
}

function setCachedOpenMausBotConfig(next: OpenMausBotAppConfigDocument): void {
  cachedConfig = next;
}

function useDetailLayoutStyles() {
  const { theme } = useUnistyles();
  const dark = theme.colorScheme !== "light";
  return useMemo(() => {
    const column: ViewStyle = {
      display: "flex",
      flexDirection: "column",
      alignItems: "stretch",
      alignSelf: "stretch",
      width: "100%",
      gap: 8,
      minWidth: 0,
    };
    const row: ViewStyle = {
      display: "flex",
      flexDirection: "row",
      flexWrap: "wrap",
      alignItems: "center",
      gap: 6,
      minWidth: 0,
    };
    const muted: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foregroundMuted,
    };
    const mono: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.foreground,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    };
    const ok: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusSuccess || "#15803d",
    };
    const warn: TextStyle = {
      fontSize: 12,
      lineHeight: 16,
      color: theme.colors.statusWarning || theme.colors.statusDanger,
    };
    const input = (focused: boolean): TextStyle => ({
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 72,
      fontSize: 12,
      lineHeight: 16,
      borderWidth: 1.5,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      minHeight: 32,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      color: theme.colors.foreground,
      borderColor: focused
        ? theme.colors.accent
        : dark
          ? "rgba(255,255,255,0.35)"
          : "rgba(0,0,0,0.22)",
      backgroundColor: dark ? "rgba(0,0,0,0.35)" : "rgba(255,255,255,0.92)",
    });
    const secretInput = (focused: boolean): TextStyle => ({
      ...input(focused),
      flexBasis: "auto",
      width: "100%",
      maxWidth: 420,
      alignSelf: "stretch",
    });
    return { column, row, muted, mono, ok, warn, input, secretInput };
  }, [dark, theme]);
}

function DetailChip({
  label,
  busy,
  disabled,
  tone,
  onPress,
  testID,
}: {
  label: string;
  busy?: boolean;
  disabled?: boolean;
  tone?: "accent" | "default";
  onPress: () => void;
  testID?: string;
}): ReactElement | null {
  const Chip = getBoundHost()?.ui?.Chip;
  if (!Chip) {
    return null;
  }
  return createElement(Chip, {
    label: busy ? "…" : label,
    tone: tone ?? "default",
    busy,
    disabled: disabled || busy,
    onPress,
    testID,
    accessibilityLabel: label,
  });
}

async function syncSecretsViaTool(host: WorkspaceAppHostApi): Promise<{ ok: boolean; error?: string }> {
  if (!host.tools?.run) {
    return { ok: true };
  }
  try {
    const result = await host.tools.run({
      appId: OPENMAUSBOT_APP_ID,
      tool: OPENMAUSBOT_SYNC_SECRETS_TOOL_REL,
      args: [],
      timeoutMs: 30_000,
    });
    const stdout = typeof result.stdout === "string" ? result.stdout : "";
    for (const line of stdout.split(/\r?\n/).reverse()) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) {
        continue;
      }
      try {
        const parsed = JSON.parse(trimmed) as { ok?: boolean; error?: string };
        if (parsed.ok === false) {
          return { ok: false, error: parsed.error || "sync failed" };
        }
        return { ok: true };
      } catch {
        // continue
      }
    }
    if (result.exitCode !== 0 && result.exitCode != null) {
      return { ok: false, error: result.stderr?.slice(0, 200) || `exit ${result.exitCode}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function RuntimeDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [portText, setPortText] = useState(String(cachedConfig.port));
  const [uiMode, setUiMode] = useState<OpenMausBotUiMode>(cachedConfig.uiMode);
  const [dataDir, setDataDir] = useState(cachedConfig.dataDir ?? "");
  const [portFocused, setPortFocused] = useState(false);
  const [dataFocused, setDataFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const host = getBoundHost();
        if (!host) {
          return;
        }
        const loaded = await loadOpenMausBotConfigFromHost(host.config);
        if (cancelled) {
          return;
        }
        setCachedOpenMausBotConfig(loaded);
        setPortText(String(loaded.port));
        setUiMode(loaded.uiMode);
        setDataDir(loaded.dataDir ?? "");
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      setError("Host 未绑定");
      return;
    }
    const port = Number(portText);
    if (!Number.isFinite(port) || port <= 0 || port > 65535) {
      setError(`端口无效（默认 ${DEFAULT_OPENMAUSBOT_PORT}）`);
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const prev = getCachedOpenMausBotConfig();
      const saved = await saveOpenMausBotConfigToHost(host.config, {
        port: Math.floor(port),
        uiMode,
        dataDir: dataDir.trim(),
      });
      setCachedOpenMausBotConfig(saved);
      setMessage("已保存");
      const needRestart =
        prev.port !== saved.port ||
        prev.uiMode !== saved.uiMode ||
        (prev.dataDir ?? "") !== (saved.dataDir ?? "");
      if (needRestart) {
        const reason =
          prev.port !== saved.port
            ? "port"
            : prev.uiMode !== saved.uiMode
              ? "ui-mode"
              : "data-dir";
        notifyOpenMausBotRuntimeNeedsRestart(reason);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [dataDir, portText, uiMode]);

  return (
    <View style={styles.column} testID="openmausbot-runtime-config">
      <Text style={styles.muted}>端口（harness，默认 8799）</Text>
      <TextInput
        value={portText}
        onChangeText={setPortText}
        onFocus={() => setPortFocused(true)}
        onBlur={() => setPortFocused(false)}
        keyboardType="number-pad"
        style={styles.input(portFocused)}
        testID="openmausbot-port-input"
      />
      <Text style={styles.muted}>UI 模式</Text>
      <View style={styles.row}>
        <DetailChip
          label={uiMode === "packaged" ? "● packaged" : "packaged"}
          onPress={() => setUiMode("packaged")}
          tone={uiMode === "packaged" ? "accent" : "default"}
          testID="openmausbot-ui-packaged"
        />
        <DetailChip
          label={uiMode === "vite-dev" ? "● vite-dev" : "vite-dev"}
          onPress={() => setUiMode("vite-dev")}
          tone={uiMode === "vite-dev" ? "accent" : "default"}
          testID="openmausbot-ui-vite-dev"
        />
      </View>
      <Text style={styles.muted}>dataDir（可选；空 = ~/.openmausbot）</Text>
      <TextInput
        value={dataDir}
        onChangeText={setDataDir}
        onFocus={() => setDataFocused(true)}
        onBlur={() => setDataFocused(false)}
        placeholder="留空使用上游默认"
        style={styles.input(dataFocused)}
        testID="openmausbot-datadir-input"
      />
      <DetailChip label="保存并重启" busy={busy} tone="accent" onPress={() => void onSave()} testID="openmausbot-runtime-save" />
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function SecretsDetailField(): ReactElement {
  const styles = useDetailLayoutStyles();
  const [composioKey, setComposioKey] = useState("");
  const [boxApiKey, setBoxApiKey] = useState("");
  const [ttsKey, setTtsKey] = useState("");
  const [fishAudioKey, setFishAudioKey] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [cfg, setCfg] = useState(cachedConfig);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const host = getBoundHost();
      if (!host) {
        return;
      }
      const loaded = await loadOpenMausBotConfigFromHost(host.config);
      if (cancelled) {
        return;
      }
      setCachedOpenMausBotConfig(loaded);
      setCfg(loaded);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onSave = useCallback(async () => {
    const host = getBoundHost();
    if (!host) {
      setError("Host 未绑定");
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const patch: Partial<OpenMausBotAppConfigDocument> = {};
      if (composioKey.trim()) {
        patch.composioKey = composioKey.trim();
      }
      if (boxApiKey.trim()) {
        patch.boxApiKey = boxApiKey.trim();
      }
      if (ttsKey.trim()) {
        patch.ttsKey = ttsKey.trim();
      }
      if (fishAudioKey.trim()) {
        patch.fishAudioKey = fishAudioKey.trim();
      }
      const saved = await saveOpenMausBotConfigToHost(host.config, patch);
      setCachedOpenMausBotConfig(saved);
      setCfg(saved);
      setComposioKey("");
      setBoxApiKey("");
      setTtsKey("");
      setFishAudioKey("");
      const synced = await syncSecretsViaTool(host);
      if (!synced.ok) {
        setError(`已保存 host.config，但同步上游失败：${synced.error}`);
      } else {
        setMessage("已保存（详情只显示 configured）；正在热重启…");
        notifyOpenMausBotRuntimeNeedsRestart("secrets");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [boxApiKey, composioKey, fishAudioKey, ttsKey]);

  const onClear = useCallback(
    async (field: "composioKey" | "boxApiKey" | "ttsKey" | "fishAudioKey") => {
      const host = getBoundHost();
      if (!host) {
        return;
      }
      setBusy(true);
      try {
        const saved = await saveOpenMausBotConfigToHost(host.config, { [field]: "" });
        setCachedOpenMausBotConfig(saved);
        setCfg(saved);
        await syncSecretsViaTool(host);
        notifyOpenMausBotRuntimeNeedsRestart("secrets");
        setMessage(`已清除 ${field}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const flag = (v: string | undefined) => (isOpenMausBotSecretConfigured(v) ? "已配置" : "未配置");

  return (
    <View style={styles.column} testID="openmausbot-secrets-config">
      <Text style={styles.muted}>密钥保存在本机 host.config；保存时同步到 OMB 数据目录（永不回显明文）。</Text>
      <Text style={styles.mono}>Composio: {flag(cfg.composioKey)}</Text>
      <TextInput
        value={composioKey}
        onChangeText={setComposioKey}
        onFocus={() => setFocused("composio")}
        onBlur={() => setFocused(null)}
        placeholder="粘贴新 Composio key"
        secureTextEntry
        style={styles.secretInput(focused === "composio")}
        testID="openmausbot-composio-input"
      />
      <Text style={styles.mono}>Box: {flag(cfg.boxApiKey)}</Text>
      <TextInput
        value={boxApiKey}
        onChangeText={setBoxApiKey}
        onFocus={() => setFocused("box")}
        onBlur={() => setFocused(null)}
        placeholder="粘贴新 Box token"
        secureTextEntry
        style={styles.secretInput(focused === "box")}
        testID="openmausbot-box-input"
      />
      <Text style={styles.mono}>TTS (ElevenLabs 等): {flag(cfg.ttsKey)}</Text>
      <TextInput
        value={ttsKey}
        onChangeText={setTtsKey}
        onFocus={() => setFocused("tts")}
        onBlur={() => setFocused(null)}
        placeholder="粘贴新 TTS key"
        secureTextEntry
        style={styles.secretInput(focused === "tts")}
        testID="openmausbot-tts-input"
      />
      <Text style={styles.mono}>Fish Audio: {flag(cfg.fishAudioKey)}</Text>
      <TextInput
        value={fishAudioKey}
        onChangeText={setFishAudioKey}
        onFocus={() => setFocused("fish")}
        onBlur={() => setFocused(null)}
        placeholder="粘贴新 Fish Audio key"
        secureTextEntry
        style={styles.secretInput(focused === "fish")}
        testID="openmausbot-fish-input"
      />
      <View style={styles.row}>
        <DetailChip label="保存密钥" busy={busy} tone="accent" onPress={() => void onSave()} testID="openmausbot-secrets-save" />
        <DetailChip label="清 Composio" busy={busy} onPress={() => void onClear("composioKey")} />
        <DetailChip label="清 Box" busy={busy} onPress={() => void onClear("boxApiKey")} />
      </View>
      {message ? <Text style={styles.ok}>{message}</Text> : null}
      {error ? <Text style={styles.warn}>{error}</Text> : null}
    </View>
  );
}

function ReloadTabSection(): ReactElement {
  const styles = useDetailLayoutStyles();
  return (
    <View style={styles.column}>
      <Text style={styles.muted}>强制重拉 ensure + Guest；整窗强刷用 ⌘⇧R。</Text>
      <DetailChip
        label="重新加载 sidecar"
        tone="accent"
        onPress={() => notifyOpenMausBotRuntimeNeedsRestart("manual")}
        testID="openmausbot-reload"
      />
    </View>
  );
}

function secretSummary(cfg: OpenMausBotAppConfigDocument): string {
  const n = ["composioKey", "boxApiKey", "ttsKey", "fishAudioKey"].filter((k) =>
    isOpenMausBotSecretConfigured(cfg[k as keyof OpenMausBotAppConfigDocument] as string | undefined),
  ).length;
  return n > 0 ? `${n} 项已配置` : "未配置";
}

export function registerOpenMausBotDetailConfig(host: WorkspaceAppHostApi): () => void {
  if (!host.ui?.registerDetailSheetExtras) {
    return () => {};
  }
  void loadOpenMausBotConfigFromHost(host.config).then((loaded) => {
    setCachedOpenMausBotConfig(loaded);
  });
  return host.ui.registerDetailSheetExtras({
    appId: OPENMAUSBOT_APP_ID,
    surface: "config",
    buildRows: () => {
      const cfg = getCachedOpenMausBotConfig();
      return [
        {
          label: "运行时",
          value: `${cfg.port} · ${cfg.uiMode}`,
          helpText: "harness 端口与 UI 模式（packaged=静态单进程；vite-dev=双进程）。",
          groupId: "openmausbot-runtime",
          groupTitle: "OpenMausBot",
          valueContent: createElement(RuntimeDetailField),
        },
        {
          label: "可选密钥",
          value: secretSummary(cfg),
          helpText: "Composio / Box / TTS；详情只显示 configured；同步到 OMB 数据目录。",
          groupId: "openmausbot-runtime",
          groupTitle: "OpenMausBot",
          valueContent: createElement(SecretsDetailField),
        },
        {
          label: "重新加载",
          value: "Tab / sidecar",
          helpText: "强制重拉 ensure + Guest。",
          groupId: "openmausbot-runtime",
          groupTitle: "OpenMausBot",
          valueContent: createElement(ReloadTabSection),
        },
      ];
    },
  });
}
