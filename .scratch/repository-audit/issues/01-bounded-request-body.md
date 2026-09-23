# [P1] 限制共享 JSON 请求体读取大小

Status: resolved
Blocked by: None

## 用户可验证结果

所有经过共享 `readJsonBody` 的 POST 路由按实际读取字节数限制请求体；超限请求返回 JSON 413，且不进入解析或产生任何副作用。

## 范围

- 默认 JSON 请求体上限 4 MiB；卡片 PNG/JSON 导入显式使用 32 MiB。
- 逐块累计实际 UTF-8 / 二进制字节数，不依赖也不信任 `Content-Length`。
- 超限立即停止读取，并能与无效 JSON 区分；路由以 JSON 413 回复。
- 测试覆盖上限内、精确边界、跨 chunk 超限、无/错误 `Content-Length`、无效 JSON、读取错误；确认超限导入不写卡，其他写路由不产生发布/持久化/任务副作用。
- 盘点全部 `readJsonBody` 调用点，确认上限和超限响应一致。

## Out of scope

- 不引入自建 HTTP server、请求队列或独立 body-parser 依赖。
- 不改变各路由成功请求的业务语义。

## 验收

- 字节数而非字符数受限；恰好达到上限可解析，越过 1 字节立即拒绝。
- 串流跨多个 chunk 越限时不再继续消费后续 chunk。
- 413 是契约一致的 JSON 错误，且拒绝发生在 JSON/base64/PNG 解析和任何副作用之前。
- typecheck、lint、相关路由测试与全量测试通过。

## Comments

- 2026-09-23：依据 GitHub #40 及用户确认的 bounded 设计开工；目标文件以共享 `src/host-faces.ts`、卡片导入路由及相关 POST 路由为主。
- 2026-09-23：已完成。`readBody` 按实际 UTF-8/二进制字节数硬上限读取，普通 JSON 为 4 MiB，卡片导入为 32 MiB；超限返回 JSON 413，错误 JSON/流返回 400。全部共享 JSON POST 路由已迁移到结构化结果；世界线和月停在解析前拒绝，避免存储副作用。`tests/host-faces.spec.ts` 与 `tests/route-contract.spec.ts` 覆盖边界、分块、读取中止和副作用顺序。