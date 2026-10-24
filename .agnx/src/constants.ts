// 场景：OpenMausBot Sub App 常量（AppId / 命令 / 面板 / ensure）。
export const OPENMAUSBOT_APP_ID = "openmausbot";
export const OPENMAUSBOT_PANEL_ID = "openmausbot.main";
export const OPENMAUSBOT_OPEN_COMMAND_ID = "openmausbot.open";

/** 短跑 sidecar：复用或拉起 OpenMausBot harness（默认 packaged 静态托管）。 */
export const OPENMAUSBOT_ENSURE_TOOL_REL = ".agnx/tools/ensure-openmausbot.mjs";

/** 短跑 sidecar：host.config 密钥 → 上游 config.json / env 同步。 */
export const OPENMAUSBOT_SYNC_SECRETS_TOOL_REL = ".agnx/tools/sync-openmausbot-secrets.mjs";

export const OPENMAUSBOT_CONFIG_KEY = "openmausbot-app-config";

export const DEFAULT_OPENMAUSBOT_PORT = 8799;
export const DEFAULT_OPENMAUSBOT_UI_PORT = 5199;

export type OpenMausBotUiMode = "packaged" | "vite-dev";
