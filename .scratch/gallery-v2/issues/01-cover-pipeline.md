# 票据 01 · 封面（立绘）管道

> Status: resolved（2026-09-27） · 依赖：无 · 分支：`feat/gallery-v2`
> 规格：`.scratch/gallery-v2/spec.md` B2 / 契约变更表 · 决策：D26 决策 4

## 范围

- `card.md` frontmatter 新增可选 `cover` 字段解析（`src/cards.ts` 解析层 + 词汇 `src/card-types.ts` `CardMeta.cover?: string`）；
- 校验：ui/ 相对路径、穿越防护、扩展名白名单（png/jpg/jpeg/webp/gif，与卡包界面资产白名单同源）、文件存在性；非法 → 收集警告 + 视为未声明（不阻断卡加载）；
- 只读路由响应（`GET /dsh-rrp/cards`、`GET /dsh-rrp/card`）携带合法 cover；
- 酒馆导入（`src/card-import.ts`）：PNG 导入把上传 PNG 本体写为新卡包 `ui/assets/cover.png` 并在 card.md 落 `cover` 声明；JSON 导入不产出封面；
- 客户端占位回退素材：升级渐变占位作为票据 02 的一部分（本票只保证数据面）。

## 验收

- 解析测试：合法声明 / 非法扩展名 / 路径穿越 / 文件缺失 / 未声明 五类用例；
- 导入测试：PNG → `ui/assets/cover.png` 存在且 card.md 含 cover；JSON → 无 cover；
- 路由响应含 cover 字段（合法时）/ 不含（非法与未声明时）；
- 相关质量门全绿。

## Out of scope

展厅客户端任何改动（票据 02）；立绘素材制作；新路由。
