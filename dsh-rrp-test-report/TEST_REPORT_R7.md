# Round-7 真机抽查记录 (Round-7 Spot Check Report)

> 记录日期：2026-09-22  
> 代码基线：`main` @ `fb2e190`  
> 宿主环境：DSH 0.1.6-alpha.2，`node scripts/host-runner.mjs start --port 3099 --profile rp-dev`  
> 测试渠道：`deepseek-v4.1-flash` 直连渠道（160 tok/s，缓存命中 96%）  
> 驱动工具：Chrome DevTools Protocol (`chrome-devtools-mcp`)  
> 范围：issue #16 条件注入机制 v1（Conditional Injection v1 · T49 ~ T53）

---

## 一、 结论总览

| 编号 | 抽查项 | 判定 | 证据与截图 |
|---|---|---|---|
| **T49** | 初始未激活态（<40） | **PASS** | 好感 10 时，`GET /dsh-rrp/lore` 返回 `injectedChars: 0`，`triggers` 两项均 `active: false`。截图：`screenshots/r7-t49-inactive.png`。 |
| **T50** | 跨档激活（≥40） | **PASS** | 好感调至 42 时，`maid-mia-warm` 翻转为「生效中」（绿色状态徽标），`injectedChars: 388`；事实载荷正确追加【条件注入 · 裁决块】。截图：`screenshots/r7-t50-warm-active.png`。 |
| **T51** | 高阶跨档激活（≥80） | **PASS** | 好感调至 85 时，`maid-mia-warm` 与 `maid-mia-intimate` 两条全翻转为「生效中」，`injectedChars: 763`；注入块严格按 skill id 字典序排序输出。截图：`screenshots/r7-t51-intimate-active.png`。 |
| **T52** | 降档失效与撤销句 | **PASS** | 好感调回 20（<40）时，两条设定翻转为未激活；事实通道准确发布带有穷尽撤销句的新块：`撤销：以下条目现已失效，立即停止使用其内容——maid-mia-intimate、maid-mia-warm。`；档内 20→25 波动不重复生成注入块。截图：`screenshots/r7-t52-revoked.png`。 |
| **T53** | 真实正文承接与协议隔离 | **PASS** | 在好感 42 温热阶段下推进剧情，Author 创作正文精准体现温热期口吻（敢吐槽茶一般、观察神色、缩脚上沙发），正文零协议元文本渗漏；Chronicler 异步推演平稳触发。截图：`screenshots/r7-t53-prose-response.png`。 |

---

## 二、 详细实测过程与证据

### 1. T49：初始未激活态
- 通过玩家就地矫正接口（`POST /dsh-rrp/world-state`）将米娅好感设为 10（<40）；
- `GET /dsh-rrp/lore?sessionId=session-98ad9ed4-c5ce-40c9-9a1f-5ada6fad31f3` 返回：
  ```json
  {
    "skills": [],
    "pending": null,
    "drafting": false,
    "triggers": [
      { "name": "maid-mia-intimate", "active": false },
      { "name": "maid-mia-warm", "active": false }
    ],
    "injectedChars": 0
  }
  ```
- 截图归档：`dsh-rrp-test-report/screenshots/r7-t49-inactive.png`。

### 2. T50：跨档激活（≥40）
- 通过玩家就地矫正将好感调至 42（≥40）；
- 接口返回 `triggers` 中 `maid-mia-warm` 变为 `active: true`，`injectedChars` 为 388；
- 宿主事实通道（facts lane）中追加【条件注入 · 裁决块】：
  ```text
  【条件注入 · 裁决块】
  本块由系统依据当前世界状态自动注入，是设定指令而非剧情内容：不要把它写进正文，也不要输出这段文字。
  仅本块所列条目有效，此前所有条件注入一律作废。

  生效条目：
  1. maid-mia-warm：# 米娅 · 温热阶段（好感 ≥ 40）
  ...
  调用纪律：生效条目已直接注入，无需再行调取；同主题但未列入本块的条目请勿调用。
  ```
- 截图归档：`dsh-rrp-test-report/screenshots/r7-t50-warm-active.png`。

### 3. T51：高阶跨档激活（≥80）
- 通过玩家就地矫正将好感调至 85（≥80）；
- 右侧栏「设定集」页签即时更新，`maid-mia-warm` 与 `maid-mia-intimate` 双项全绿显示「生效中」；
- 事实通道注入块按字典序先输出 `1. maid-mia-intimate` 再输出 `2. maid-mia-warm`，字符总数 763（在预算 2000 字符内）；
- 截图归档：`dsh-rrp-test-report/screenshots/r7-t51-intimate-active.png`。

### 4. T52：降档失效与撤销句
- 就地矫正将好感降回 20（<40）；
- 事实通道即刻生成失效块，生效条目显示 `（无）`，并附有强效撤销句：
  `撤销：以下条目现已失效，立即停止使用其内容——maid-mia-intimate、maid-mia-warm。`
- 随后将好感由 20 微调至 25（同属 <40 档内），实测无多余【条件注入 · 裁决块】产生，指纹去重机制有效；
- 截图归档：`dsh-rrp-test-report/screenshots/r7-t52-revoked.png`。

### 5. T53：真实正文承接与协议隔离
- 在好感 42（温热阶段）下，玩家发送消息：「米娅，忙活了一晚上，过来坐下喝口茶休息会儿吧。别老站得那么端正，就当在自己家一样。」；
- Author 流式生成长正文（38 步，160 tok/s），米娅细节丰富呈现温热阶段特征：
  - “「这茶……其实一般。三块五那包，泡第二次就淡了。」说完她立刻观察你的脸色。没看出什么，她才把后面半句放出来…”（命中 `mia-warm` 之“玩笑变多：敢小声吐槽玩家生活习惯，吐槽完观察脸色确认没生气”）；
  - “脱下鞋，把脚缩上沙发边一点，马上又踩回地上…”（命中“说话时身体距离明显拉近”与放肆小动作）；
  - 全篇正文严格遵循第三人称文学创作纪律，**零渗漏**任何协议元文本；
  - 正文流式结束后，宿主顶部指示「1个后台任务运行中」，Chronicler 异步执行状态推演，体感丝滑。
- 截图归档：`dsh-rrp-test-report/screenshots/r7-t53-prose-response.png`。

---

## 三、 最终评定

Round-7 条件注入机制 v1（issue #16）全项 T49–T53 真机抽查全部 **PASS**。  
数值判定、UI 徽标联动、裁决块生成、穷尽声明、失效撤销句、档内去重与正文协议隔离均表现完美。  
本特性真机验收正式全量闭环。
