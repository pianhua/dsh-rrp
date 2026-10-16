# 架構決策記錄（ADR）

記錄**已經拍板的架構決策**：當時的背景、決定本身、以及**被否決的方案與接受的代價**。

ADR 一旦接受就保留，即使後來被修訂或取代——被取代的記錄仍能解釋「為什麼當初不是那樣做的」。
**修改決策時新增一篇，不改寫舊篇**；舊篇在狀態欄標明被誰取代。

術語見根 [`CONTEXT.md`](../../CONTEXT.md)（領域詞義與邊界）與
[`docs/reference/GLOSSARY.md`](../reference/GLOSSARY.md)（命名對照與禁用舊詞）。

## 閱讀順序

建議按編號順序讀，前幾篇建立了後面幾篇的前提。

| 編號 | 主題 | 狀態 |
| --- | --- | --- |
| [0001](0001-plugin-composes-custom-rp-mode.md) | 插件組合出自定義 RP 模式 | 接受 |
| [0002](0002-defer-director-scratchpad.md) | 先不做導演草稿板 | 暫緩（不在第一版範圍） |
| [0003](0003-author-and-state-accounting-async.md) | Author 與狀態記賬異步（正文優先） | 接受（已知代價已記錄） |
| [0004](0004-chronicler-is-a-real-agent.md) | Chronicler 是一個正經 Agent | 接受 |
| [0005](0005-world-state-structure-evolves.md) | 世界狀態結構動態演進 | 接受（邊界經 0022 修訂） |
| [0006](0006-player-correction-is-lock-free.md) | 玩家矯正是自然時序，無鎖 | 接受（核心紅線） |
| [0007](0007-knowledge-via-dsh-skills.md) | 知識體系全面 Skills 化 | 接受 |
| [0008](0008-controlled-knowledge-sedimentation.md) | 允許受控的動態知識沉澱 | 接受 |
| [0009](0009-branches-map-to-native-session-fork.md) | 分支映射原生 `Session.fork` | 接受 |
| [0010](0010-collaborate-with-dsh-synapse-not-benchmark.md) | 與 dsh-synapse 協同，而非對標 | **部分取代**（地圖職責已自建） |
| [0011](0011-summary-by-dedicated-agent.md) | 摘要由獨立 Agent 負責 | 接受 |
| [0012](0012-memory-is-an-external-extension.md) | 記憶能力外置（擴展層） | 接受（方向已定，尚未實施） |
| [0013](0013-card-format-decided-later.md) | 卡包格式後定 | 已實現（規範以 CARDS.md 為準） |
| [0014](0014-no-sillytavern-ecosystem-compat.md) | 不兼容酒館卡生態 | 接受（經 0026 修訂強化） |
| [0015](0015-personal-toy-scope.md) | 個人玩具定位 | 接受（核心紅線） |
| [0016](0016-anti-cliche-pattern-list-provenance.md) | 反八股句式清單：來源與協議 | 接受 |
| [0017](0017-conditional-injection-v1.md) | 條件注入 v1 | 接受 |
| [0018](0018-unified-agent-prompt-contract.md) | 統一 AgentPromptContract | 接受 |
| [0019](0019-copilot-promoted-to-player-steward.md) | 月停升格為玩家私屬幕僚 | 接受（命名經 0022 修訂） |
| [0020](0020-strong-jailbreak-layer.md) | 強破限層 | 接受 |
| [0021](0021-no-plugin-content-in-chat-flow.md) | 聊天流內不放插件內容 | 接受（知情後重申） |
| [0022](0022-worldstate-vs-summarizer-division.md) | WorldState 與劇情脈絡的職責分工 | 接受（2026-09-23 修訂） |
| [0023](0023-worldstate-workspace-and-timeline.md) | WorldState 工作區與持久時間線 | 已實現（Phase 1–9 交付） |
| [0024](0024-worldline-v2-dual-column.md) | 世界線 v2：拓撲與摘要解耦的雙欄視圖 | 已實現（一期交付並真機驗收） |
| [0025](0025-stage-v2-card-frontend-platform.md) | 舞臺 v2：卡包前端應用平臺 | 已實現（一期交付） |
| [0026](0026-gallery-v2-cover-grid.md) | 展廳 v2：封面網格牆 + 自有格式定性 | 已實現（DEF-02 驗收 10/10 PASS） |
| [0027](0027-docs-sources-context-and-adr.md) | 文檔真源：CONTEXT.md + 有序 ADR | 接受（2026-10-16） |

## 關鍵脈絡

單篇 ADR 只講一個決定；**決定之間的推理鏈**才是真正難以重建的部分。以下六條是最重要的。

**狀態權威的確定順序（0004 → 0005 → 0006 → 0022）**
先確定「誰寫狀態」（0004：Chronicler 是有判斷力的 Agent，不是提取器），再確定「誰能改狀態」
（0006：玩家矯正是自然時序的最後寫入，不是鎖），最後才確定「狀態裡裝什麼」
（0005 動態結構 → 0022 劃清 WorldState 管近期事實、劇情脈絡管長線方向）。
順序反了就会先造出一堆字段，再去争论谁该改它们。

**分支與地圖（0009 → 0010 → 0024）**
0009 定了分支物理拓撲用原生 `Session.fork`；0010 把「畫地圖」這件事判給了外部插件 dsh-synapse；
0024 證明這個判斷撐不住——世界線圖確實是玩家高頻需求，最終還是自己建。
0010 的教訓已經寫進它的「被否決方案」：**「暫不自建」不是「永不自建」**。
但 0010 的初衷（不把單一插件當唯一標杆）至今有效。

**呈現面要有歸屬（0021 → 0025）**
0021 在明確知道宿主提供官方聊天插入位的情況下，仍然選擇聊天流內零插件內容——
「正文區屬於宿主」。0025 把這個思路延伸成舞臺：插件的表達力往自己的渲染面走，不往別人的呈現裡摻。
這是本項目對「Host-First」理解最深的一條：**能不用宿主能力改造宿主呈現，就不用**。

**卡包格式的三步（0013 → 0014 → 0026）**
0013 決定「格式後定，不受舊格式約束」；0014 決定「不兼容酒館，靠 AI 單向轉譯」；
0026 面對「轉譯工具算不算違反 0014」的張力，拍板為「卡包完全自有格式，酒館僅為一次性導入轉譯的數據來源，
運行時零酒館字段」。三步把「不兼容」從口號變成了可執行的邊界。

**文風與破限（0016 → 0018 → 0020）**
0016 把句式級中文 AI 腔禁令升為常駐 persona（與「防全知」從 skill 升為鐵律同一邏輯）；
0018 統一五個 Agent 的工程結構但嚴格分流業務內容——Author 的創作授權永不進數據管道；
0020 在此基礎上疊加 JX 級邏輯護盾與全正向執行層。共同結論：**禁令要常駐，但不能外溢到別的場景**。

**文檔編排（0027）**
2026-09-21 曾明確決定「不創建平行 CONTEXT.md / docs/adr/」。2026-10-16 所有者要求工程紀律對齊
dsh-tavern，該決定被取代，理由與代價寫在 0027 裡。**D1–D26 原編號全部保留不變**，
因此 `src/` 與 `tests/` 註釋裡既有的 `D6`、`D21` 引用零改動繼續有效。

## 決策紀律

1. 每條決策都有所有者拍板依據，**AI 不得自行推翻**。
2. 實現中發現某決策不可行：**先回報所有者**說明具體阻塞，不默默改設計。
3. 變更決策時**新增一篇 ADR**並在舊篇狀態欄標明取代關係，不改寫舊篇正文；
   同時更新受影響的契約文檔，並在提交信息中說明。
4. 實現細節（字段名、錯誤文案、UI 間距）不進 ADR，留給規格與票據。

## 相關文檔

領域詞義與邊界 [`../../CONTEXT.md`](../../CONTEXT.md) · 命名對照與禁用舊詞
[`../reference/GLOSSARY.md`](../reference/GLOSSARY.md) · 產品目標規格
[`../DESIGN.md`](../DESIGN.md) · 架構總覽 [`../dev/architecture.md`](../dev/architecture.md) ·
真機驗收檔案 [`../reference/acceptance/`](../reference/acceptance/)
