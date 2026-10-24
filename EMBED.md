## 上游嵌入

- 上游基线：milind-soni/OpenMausBot@f2f3a62（fork：`agnx-lab/OpenMausBot`，**固定在此节点，不跟随上游最新**）
- 上游原生平台：桌面 ✅ | 网页 ✅ | 移动 ❌（依据：Vite Web UI + Electron 打包脚本）
- 工作方式：整仓魔改（真树 `$AGNX_HOME/apps/openmausbot`，排除 `enterprise/`）
- 推荐模式：Wrap + Sidecar + Guest（`auth: none` → `direct-iframe`）
- 默认 `uiMode=packaged`：`pnpm build` 后 harness 以 `OMB_STATIC_DIR=dist` 单进程托管 UI（`:8799`）
- `uiMode=vite-dev`：launcher 同启 harness(`8799`) + Vite(`5199`）；Guest 指向 `:5199`
- Agent 工具：极薄 `openmausbot_health` / `openmausbot_open`；审批与 Computer 留在 OMB UI
- 数据：默认 `~/.openmausbot`；可选 `host.config.dataDir` → `OMB_DATA_DIR`
- 共存：与 Grok App / AstrBot / Agnx 编码流会话互不同步；CLI session 默认隔离 dataDir
- 活页：`docs/sub-app/OpenMausBot子应用需求_openmausbot-sub-app.md`（Agnx monorepo）

## 上游改动清单

**唯一改动：`/api/health` 回显 `AGNX_SIDECAR_INSTANCE`（两处）。**

| 文件                      | 位置                                      | 改了什么                                               |
| ------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `server/index.ts`         | gate 外的 public health                   | 返回体加 `...(instanceId ? { instanceId } : {})`       |
| `server/routes/status.ts` | 带 `pid` / `capabilities` 的握手 health   | 同上（上游已把这处从 `index.ts` 拆出，补丁跟着搬过去） |

**为什么必须有**：宿主启动 sidecar 时注入 `AGNX_SIDECAR_INSTANCE`，并把该 id 存进台账；
之后重启复用时，宿主会探测 `/api/health` 并比对返回的 `instanceId`
（`packages/server/src/workspace-apps/sidecar-instance-mark.ts`）。
不匹配就判定「端口被外站占用」并 fail-closed（`foreignPortOccupiedMessage`）。

`probeSidecarHealthMark` 对无标记的旧 sidecar 有一条回退
（`isLegacyUnmarkedHealthBody`），但只认 `ok` / `status` / `ready` 字段——
openmausbot 的 health 三个都没有，**回退不成立，没有补丁就是 mismatch**。

**未注入该环境变量时行为与上游完全一致**（不加字段）。已实测两种情形：
带 `AGNX_SIDECAR_INSTANCE` 时返回 `instanceId`；不带时返回体与上游逐字段相同。
