# Active Task

**Current Status**: ✅ 功能与实机验证已收官；代码工作暂停，进入交接

**Last Updated**: 2026-09-17

> 执行队列与停点以 [`NEXT_AI_HANDOFF.md`](NEXT_AI_HANDOFF.md) 为准；本文件只记「已完成 / 待办」快照。

---

## Completed Work

### Core Features (100%)
- ✅ D5: Dynamic World State（数据模型 + Chronicler 集成 + UI 增删改查 + clamp 约束）
- ✅ D6: Natural-time Sequencing Window（UI gate，无锁；推演中禁存、完成后自动重载）
- ✅ P3.2: Map Lifecycle Cleanup（`forgetActivity` / `forgetState`）
- ✅ P4: YAML Parser Replacement（官方 `yaml` 包，删除手写子集解析器）
- ✅ 写作质量：Author 人设铁律 6（反全知）+ `presets/rp/skills/` 三个按需写作技能
- ✅ 沉浸视图（story-view）整体移除

### DSH-Synapse RP 剧情地图（新增，已实机验证）
- ✅ `dsh-synapse-rp` v0.4.1-rp.1：节点降噪、72 字卡片摘要、剧情语义文案（回溯 / 开辟新世界线）
- ✅ 本地 link 进 `rp-dev` profile，与 dsh-rrp 协同；不上游提 PR
- ✅ 实机 5 / 5 PASS，见 [`reference/SYNAPSE_RP_VERIFICATION.md`](reference/SYNAPSE_RP_VERIFICATION.md)
- 记录：[SYNAPSE_RP_CHANGES.md](reference/SYNAPSE_RP_CHANGES.md) · [SYNAPSE_RP_ADAPTATION.md](reference/SYNAPSE_RP_ADAPTATION.md)

### Quality Assurance
- ✅ P0 Acceptance Testing: 7/7
- ✅ D5/D6/P4 真机测试: 19/19（rp-dev）
- ✅ Synapse RP 地图真机测试: 5/5（rp-dev）
- ✅ Unit Tests: 117/117 pass
- ✅ Type Checking: 0 errors

---

## 已修复的历史问题

| 问题 | 状态 |
|:---|:---|
| Scribe job 缺 `cancel` 回调（`jobs-local` 报 `reading 'bind'`） | ✅ 已修（`sediment-route.ts:165`） |
| 世界状态面板 i18n 裸 Key（`section.coreState` 等） | ✅ 字典已补 zh/en |
| 命令文本（如 `/summary off`）被当普通消息发出 | ✅ 人设加输入过滤；现象留档 `reference/COMMAND_SANITIZATION_ISSUE.md` |
| 设置页高亮全局 `rp` 造成「会话预设没生效」误判 | ✅ 面板加只读会话预设标签 `preset.hint` |

---

## Remaining (Not Blocking)

| 优先级 | 事项 | 说明 |
|:---|:---|:---|
| 中 | P3.1 移除两条客户端轮询 | 需确认 DSH client Jobs / 投影推送 seam |
| 中 | D5 端到端集成测试 | 目前由实机测试覆盖 Chronicler 动态建字段 |
| 低 | P5 产品增量 | 第二张测试卡、草稿编辑、i18n 精修 |
| 低 | Synapse 加固 | `normalizeState`/`messagesFor` 追加 `isRpInjectionText`（免删缓存） |
| 低 | Synapse 可选增强 | 卡片微状态标签、世界线命名引导 |

---

## Release Status

核心功能与真机验证达标；剩余项均为可选增强或运维打磨。
