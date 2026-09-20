# HTTP 契约参考

> 前后端唯一真相：`src/route-contract.ts`（#22）。本页是其人类可读镜像——**以代码为准**，改契约必改两边。

## 总则

- 全部路由挂在宿主 webServer 的 exact path 上（零自建服务器），前缀 `/dsh-rrp/`；
- 非 2xx 响应**只准**返回 `RrpErrorBody`：`{ "error": "..." }`；
- 所有会话级端点带 `sessionId`（query 或 body），非 RP 会话一律 403，未知会话 404；
- 类型单一来源在 `src/route-contract.ts`，服务端注册与客户端 fetch 都 import 它——协议级测试（`tests/route-contract.spec.ts`）锁死注册路径与契约一致。

## 端点一览

| 路径 | 方法 | 用途 | 响应 |
| :--- | :--- | :--- | :--- |
| `/dsh-rrp/cards` | GET | 卡包列表 | `{ cards: CardMeta[] }` |
| `/dsh-rrp/cards/one?id=` | GET | 单卡全量 | `{ card: CardPack }` |
| `/dsh-rrp/cards/import` | POST | 酒馆卡转译导入（`kind: png\|json` + base64 `data`） | `CardImportResponse`（`{ ok: true, id, name }`） |
| `/dsh-rrp/start` | POST | 开卡：发布卡包+初始状态，最后追加开场白 | `StartResponse`（含 `openingWritten: assistant\|notice\|none`） |
| `/dsh-rrp/world-state` | POST | 玩家矫正（无锁最后写入；无变化短路 `unchanged`） | `CorrectionResponse` |
| `/dsh-rrp/activity` | GET | 归因账本（谁在哪轮改了什么） | `RrpActivityLog` |
| `/dsh-rrp/lore` | GET/POST/DELETE | 设定集：列表(含 when 触发视图)/动作流(draft·confirm·discard·manual)/删条目 | `LoreGetResponse` 等 |
| `/dsh-rrp/copilot` | GET/POST/DELETE | 月停：历史 / 问答(SSE) / 清空 | 见下 SSE 协议 |
| `/dsh-rrp/copilot/undo` | POST | 一键撤销（还原快照=新发布，历史留痕） | `CopilotUndoResponse` |
| `/dsh-rrp/card-ui?card=&file=` | GET | 卡包声明式 UI：`ui/manifest.json` 与 `ui/*.html` 页（只读） | `CardUiResponse` / `text/html` |
| `/dsh-rrp/export/novel?sessionId=&title=&format=` | GET | 小说导出（`md`\|`txt`，附件下载，#31-C） | `text/markdown` \| `text/plain` |
| `/dsh-rrp/card-workspace` | POST | 一卡一区：按卡名建/复用工作区并绑定会话（#37） | `CardWorkspaceResponse` |
| `/dsh-rrp/copilot/proposals` | POST | 卡包/笔记提案裁决（`action: confirm\|discard` + `id`；待裁清单随 GET `/dsh-rrp/copilot` 返回） | `{ ok: true, proposals: StewardProposal[] }` |
| `/dsh-rrp/worldlines/tree` | GET | 世界线全图（live 会话折叠 + 冷会话骨架） | `WorldlineTreeResponse` |
| `/dsh-rrp/worldlines/hidden` | GET/POST | 软归档名单 | `WorldlineHiddenResponse` |
| `/dsh-rrp/card-ui?card=&file=` | GET | 卡包声明式界面：`ui/manifest.json` 或 `ui/*.html` 原文 | `CardUiResponse` |
| `/dsh-rrp/export/novel?sessionId=&format=&title=` | GET | 小说导出（`md`/`txt`，附件下载） | 文本流（非 JSON） |
| `/dsh-rrp/card-workspace` | POST | 一卡一区：幂等确保本卡专属工作区（#37） | `CardWorkspaceResponse`（`workspaceId`/`path`/`created`） |

## Copilot SSE 协议

POST `/dsh-rrp/copilot` 返回 `text/event-stream`，帧格式 `event: <名>\ndata: <json>\n\n`（编解码共享函数 `encodeSseFrame`/`drainSse`）。事件词表：

| 事件 | 载荷 | 语义 |
| :--- | :--- | :--- |
| `chunk` | `{ text }` | 打字机增量，可多次 |
| `action` | `{ applied: CopilotTurnAction[] }` | 动作块执行结果，可多次 |
| `done` | `{ turn: CopilotTurn, undoCount }` | **终帧**（成功） |
| `error` | `{ error }` | **终帧**（失败） |

终止语义：流**恰好**以一个终帧结束；无终帧即传输失败，客户端重拉历史收敛。坏帧（JSON 解析失败）跳过不沉船。

## 持久层（非 HTTP，但同属契约面）

- **会话日志**：状态寄存在已知 `user/message` 的 `source.rrp`（绝不发明事件类型——铁律一）；
- **宿主存储域**：`dsh_rrp_copilot`（月停历史，按 sessionId 键控，fork 不继承）与 `dsh_rrp_worldlines`（软归档名单）——插件拥有记录、宿主拥有耐久性（原子写链 + zod 边界校验）；
- **投影键**（读面）：`rrpWorldState` / `rrpTranscript`（含 Chronicler 折叠游标 `lastFoldSeq`）/ `rrpSummary` / `rrpSediment`（历史契约名）/ `rrpCard` / `rrpSettings`（摘要开关与周期）/ `rrpWorldlineDigest`。
