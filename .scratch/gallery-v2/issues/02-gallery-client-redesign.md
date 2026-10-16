# 票据 02 · 展厅客户端重做

> Status: resolved（2026-09-28） · 依赖：票据 01（封面数据，已 resolved `3c8a959`） · 分支：`feat/gallery-v2`
> 规格：`.scratch/gallery-v2/spec.md` B1/B3/B4/B5 · 决策：D26 决策 1/2/3/6

## 范围

- `src/client/gallery-panel.tsx` 重写为封面网格墙 + 右侧滑出详情面板（响应式列数、激活高亮、Esc/关闭返回）；
- 详情面板层级：Hero（大封面/名/简介/标签/作者/版本）→ 开场白（下拉+预览）→ 技能 chips → 玩家角色只读 → 开始条；
- **移除**：主角名覆写输入（#25）、自设人设 textarea（P1-B）；`start()` 与 `GalleryPanelProps` 移除对应参数；`withPlayerPersona` 调用移除（局内 `player` 字段编辑保留，不动世界状态页签）；
- 保留行为落位：搜索/刷新保留选中（网格态语义）、导入入口、一卡一区/跳转/命名（代码路径不变，仅必要适配）；
- locale 键重排（新增网格/详情/封面键，删除 name/persona 键；`locale-keys.spec.ts` 全绿）；
- 视觉：宿主原子库 + `--dsw-alias-*` token；设计细节参照 ST 勘察报告（见规格）在 token 体系内落地，零新样式栈；
- 测试：网格渲染 / 封面回退链（含 onerror）/ 开场白选择 / 搜索 / 详情层级 / 无 name-persona 控件断言 / 刷新保留选中。

## 验收

- 上述组件测试全绿；`tests/start.spec.ts` 等受牵动测试清点更新；
- 质量门全绿；
- 真机验收由票据 03 执行。

## Out of scope

封面数据面（票据 01）；续玩/卡管理/主角编辑区；`player` 字段局内编辑入口的任何改动。
