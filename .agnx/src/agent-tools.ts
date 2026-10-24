// 场景：W4 — 极薄 Agnx Agent 工具：openmausbot_health / openmausbot_open。
import type { WorkspaceAppHostApi } from "@agnx-lab/app-sdk";
import {
  OPENMAUSBOT_APP_ID,
  OPENMAUSBOT_ENSURE_TOOL_REL,
  OPENMAUSBOT_PANEL_ID,
} from "./constants";
import {
  loadOpenMausBotConfigFromHost,
  openMausBotConfigToEnsureArgs,
} from "./openmausbot-config";

const GROUP = {
  groupId: "openmausbot",
  groupTitle: "OpenMausBot",
} as const;

function pickEnsurePayload(result: {
  resultJson?: unknown;
  stdout?: string;
}): Record<string, unknown> | null {
  const json = result.resultJson;
  if (json && typeof json === "object" && json !== null) {
    return json as Record<string, unknown>;
  }
  const stdout = typeof result.stdout === "string" ? result.stdout : "";
  for (const line of stdout.split(/\r?\n/).reverse()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("{")) {
      continue;
    }
    try {
      return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      // continue
    }
  }
  return null;
}

export function registerOpenMausBotAgentTools(host: WorkspaceAppHostApi): () => void {
  return host.registerAgentTools({
    appId: OPENMAUSBOT_APP_ID,
    availability: "always",
    tools: [
      {
        name: "openmausbot_health",
        ...GROUP,
        description:
          "检查 OpenMausBot harness 是否就绪（必要时短跑 ensure）。返回 origin/port；不代替 OMB 内审批与工具。",
        inputSchema: {
          type: "object",
          properties: {
            ensure: {
              type: "boolean",
              description: "为 true 时主动跑 ensure（默认 true）",
            },
          },
          additionalProperties: false,
        },
        execute: async (input) => {
          const ensure = input?.ensure !== false;
          if (!ensure) {
            return {
              ok: true,
              message: "未执行 ensure；请打开 OpenMausBot Tab 或设 ensure:true。",
            };
          }
          if (!host.tools?.run) {
            return {
              ok: false,
              error: "host_tools_unavailable",
              message: "需 Agnx 桌面端 host.tools.run。",
            };
          }
          const cfg = await loadOpenMausBotConfigFromHost(host.config);
          const result = await host.tools.run({
            appId: OPENMAUSBOT_APP_ID,
            tool: OPENMAUSBOT_ENSURE_TOOL_REL,
            args: openMausBotConfigToEnsureArgs(cfg),
            timeoutMs: 300_000,
          });
          const payload = pickEnsurePayload(result);
          if (payload) {
            return payload;
          }
          return {
            ok: false,
            error: "empty_ensure_result",
            exitCode: result.exitCode,
            timedOut: result.timedOut,
            stderr: result.stderr?.slice(0, 400),
          };
        },
      },
      {
        name: "openmausbot_open",
        ...GROUP,
        description:
          "在工作区打开 OpenMausBot Tab（上游多 Bot 聊天壳）。审批与 Computer 留在 OMB UI。",
        inputSchema: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
        execute: async () => {
          host.openMiniAppTab({
            appId: OPENMAUSBOT_APP_ID,
            panelId: OPENMAUSBOT_PANEL_ID,
          });
          return {
            ok: true,
            appId: OPENMAUSBOT_APP_ID,
            panelId: OPENMAUSBOT_PANEL_ID,
            message: "已请求打开 OpenMausBot Tab。",
          };
        },
      },
    ],
  });
}
