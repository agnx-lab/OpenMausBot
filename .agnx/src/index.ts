// 场景：OpenMausBot Sub App 入口 — Guest + ensure + retain + 极薄工具 + 详情配置。
import type { WorkspaceAppHostApi, WorkspaceAppModule } from "@agnx-lab/app-sdk";
import { OpenMausBotIcon } from "./openmausbot-icon";
import {
  OPENMAUSBOT_APP_ID,
  OPENMAUSBOT_ENSURE_TOOL_REL,
  OPENMAUSBOT_OPEN_COMMAND_ID,
  OPENMAUSBOT_PANEL_ID,
  OPENMAUSBOT_SYNC_SECRETS_TOOL_REL,
} from "./constants";
import { registerOpenMausBotDetailConfig } from "./detail-config";
import { registerOpenMausBotAgentTools } from "./agent-tools";
import { bindOpenMausBotPanelHost, OpenMausBotPanel } from "./panel";

export const appId = OPENMAUSBOT_APP_ID;

function openOpenMausBotTab(
  host: WorkspaceAppHostApi,
  context?: {
    serverId?: string;
    workspaceId?: string;
    currentPathname?: string | null;
  },
): void {
  host.openMiniAppTab({
    appId: OPENMAUSBOT_APP_ID,
    panelId: OPENMAUSBOT_PANEL_ID,
    serverId: context?.serverId,
    workspaceId: context?.workspaceId,
    currentPathname: context?.currentPathname,
  });
}

export function activate(host: WorkspaceAppHostApi): void {
  bindOpenMausBotPanelHost(host);
  registerOpenMausBotDetailConfig(host);
  registerOpenMausBotAgentTools(host);

  host.registerMiniApp({
    id: OPENMAUSBOT_PANEL_ID,
    appId: OPENMAUSBOT_APP_ID,
    title: "OpenMausBot",
    icon: OpenMausBotIcon,
    component: OpenMausBotPanel,
    iframeShortcutCapture: true,
    isolation: {
      mode: "iframe",
      sidecarTools: [OPENMAUSBOT_ENSURE_TOOL_REL, OPENMAUSBOT_SYNC_SECRETS_TOOL_REL],
      note: "Tab Guest 加载本仓受管 OpenMausBot；默认 packaged harness + 静态 UI",
    },
  });

  host.registerCommand({
    id: OPENMAUSBOT_OPEN_COMMAND_ID,
    appId: OPENMAUSBOT_APP_ID,
    title: "OpenMausBot",
    keywords: ["openmausbot", "omb", "maus", "多bot", "通讯录", "telegram"],
    icon: OpenMausBotIcon,
    sidebarAction: {
      defaultVisible: true,
      label: "OMB",
      order: 64,
    },
    run: (context) => {
      openOpenMausBotTab(host, context);
    },
  });
}

const moduleExport: WorkspaceAppModule = {
  appId: OPENMAUSBOT_APP_ID,
  activate,
};

export default moduleExport;

export {
  OPENMAUSBOT_APP_ID,
  OPENMAUSBOT_OPEN_COMMAND_ID,
  OPENMAUSBOT_PANEL_ID,
} from "./constants";
export { OpenMausBotPanel } from "./panel";
