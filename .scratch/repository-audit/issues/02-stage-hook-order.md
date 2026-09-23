# [P2] 保持 StagePanel 的 projection Hook 调用顺序稳定

Status: resolved
Blocked by: None

## 用户可验证结果

同一 StagePanel 实例无卡→有卡→无卡切换时不会触发 React Hook 顺序/数量错误；digest 更新继续驱动 Card UI transcript，卡片切换不残留旧 manifest。

## 范围

- 让每轮渲染调用相同顺序和数量的所有 `useProjection` Hook。
- 在同一 DOM/React root 内驱动上述三态转换，不能以多个独立 SSR 静态渲染替代。
- 断言阶段面板内容正确，切换过程中无 Hook 错误。
- 如有必要增加仅测试用轻量 DOM 环境；不改生产依赖或 UI 行为。

## Out of scope

- 不重构 Stage 面板组件、不改变卡 UI 契约或投影语义。
- 不扩展浏览器端到端测试基建。

## 验收

- 同一 StagePanel 实例无卡→有卡→无卡转换无 Hook 顺序/数量错误。
- digest 更新仍刷新卡 UI transcript，卡切换后旧 manifest 不残留。
- 类型检查、lint、相关客户端测试及全量测试通过。

## Comments

- 2026-09-23：依据 GitHub #41 及用户确认的 bounded 设计开工；测试 seam 为真实 React root 下的 StagePanel 公共组件行为，使用仅测试用 happy-dom。
- 2026-09-23：已完成。digest 投影 Hook 移到无卡早退之前；同一 React root 的测试覆盖无卡→有卡→无卡、digest prose 推送及切换卡片后的 iframe 内容。