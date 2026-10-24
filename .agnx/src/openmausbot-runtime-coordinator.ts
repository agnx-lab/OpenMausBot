// 场景：OpenMausBot 运行时协调 — 配置变更后通知面板停旧再起（W3）。
export type OpenMausBotRuntimeRestartReason =
  | "port"
  | "ui-mode"
  | "data-dir"
  | "secrets"
  | "manual";

type RestartListener = (reason: OpenMausBotRuntimeRestartReason) => void;

const listeners = new Set<RestartListener>();

export function subscribeOpenMausBotRuntimeRestart(listener: RestartListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyOpenMausBotRuntimeNeedsRestart(
  reason: OpenMausBotRuntimeRestartReason,
): void {
  for (const listener of listeners) {
    listener(reason);
  }
}
