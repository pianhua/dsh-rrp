# Chronicler 自定义字段创建语法

> **用途**：当四域（characters/inventory/scene/flags）无法表达特定状态时，Chronicler 可创建自定义字段。
> **原则**：只在确实需要时创建，避免滥用和同义重复。

---

## 适用场景

| 场景 | 示例字段 | 说明 |
|:---|:---|:---|
| 数值属性 | magic_power, sanity, reputation | 可量化的角色属性 |
| 关系网络 | trust_alice, bond_guild | 特定关系的数值表达 |
| 时间线事件 | days_since_incident | 剧情计时器 |
| 特殊状态 | curse_active, quest_stage | 布尔开关或枚举 |

**不适用场景**（用四域）：
- 角色好感度 → 用 `characters.好感`
- 物品数量 → 用 `inventory`
- 地点时间 → 用 `scene`
- 事件标记 → 用 `flags`

---

## 创建语法

在输出的 JSON 中加入 `createFields` 数组：

```json
{
  "characters": { ... },
  "inventory": { ... },
  "scene": { ... },
  "flags": { ... },
  "createFields": [
    {
      "id": "magic_power",
      "type": "number",
      "value": 75,
      "min": 0,
      "max": 100
    },
    {
      "id": "curse_active",
      "type": "boolean",
      "value": false
    }
  ]
}
```

创建后，该字段会自动添加到 WorldState，后续轮次可直接更新：

```json
{
  "characters": { ... },
  "inventory": { ... },
  "scene": { ... },
  "flags": { ... },
  "magic_power": { "type": "number", "value": 80, "min": 0, "max": 100 }
}
```

---

## 字段规范

### 字段 ID（必须）

- **格式**：只能包含英文字母、数字、下划线（`[a-zA-Z0-9_]`）
- **风格**：snake_case（小写+下划线），如 `magic_power`
- **禁止**：
  - 中文、空格、特殊符号
  - 保留名称：`characters`, `inventory`, `scene`, `flags`
  - 同义重复：已有 `magic_power` 不能再创建 `mana`, `magic`, `mp` 等

### 类型（必须）

| 类型 | 值示例 | 适用场景 |
|:---|:---|:---|
| `number` | `75`, `-10`, `3.14` | 数值属性、计数器 |
| `string` | `"禁忌咒语"`, `"进行中"` | 文本状态、枚举值 |
| `boolean` | `true`, `false` | 开关标记 |

### 约束（可选）

仅 `number` 类型支持：

- `min`：最小值（含），超出时自动修正
- `max`：最大值（含），超出时自动修正

示例：
```json
{
  "id": "sanity",
  "type": "number",
  "value": 60,
  "min": 0,
  "max": 100
}
```

如果后续推演中 `sanity` 被设为 `-10`，系统自动修正为 `0`。

---

## 防止同义重复

**错误示例**：
```json
// 第一轮创建
"createFields": [{ "id": "magic_power", "type": "number", "value": 75 }]

// 第二轮又创建（❌ 重复！）
"createFields": [{ "id": "mana", "type": "number", "value": 80 }]
```

**正确做法**：
- 创建前检查是否已有类似字段
- 同一概念只创建一次，后续直接更新值
- 使用统一命名（如都用 `magic_power`，不混用 `mana`/`mp`）

系统会自动拒绝明显的同义词（忽略大小写和下划线），但仍需 Chronicler 主动判断。

---

## 完整示例

### 场景：引入魔法系统

**第一轮（创建字段）**：
```json
{
  "characters": {
    "艾莉丝": { "affinity": 5, "mood": "兴奋" }
  },
  "inventory": {},
  "scene": { "location": "魔法学院" },
  "flags": { "已学会基础咒语": true },
  "createFields": [
    {
      "id": "magic_power",
      "type": "number",
      "value": 50,
      "min": 0,
      "max": 100,
      "description": "当前魔力值"
    },
    {
      "id": "spell_slots",
      "type": "number",
      "value": 3,
      "min": 0,
      "max": 5,
      "description": "可用法术位"
    }
  ]
}
```

**第二轮（更新字段）**：
```json
{
  "characters": {
    "艾莉丝": { "affinity": 6, "mood": "疲惫" }
  },
  "inventory": {},
  "scene": { "location": "魔法学院" },
  "flags": { "已学会基础咒语": true },
  "magic_power": { "type": "number", "value": 30, "min": 0, "max": 100 },
  "spell_slots": { "type": "number", "value": 1, "min": 0, "max": 5 }
}
```

**说明**：
- 第一轮用 `createFields` 创建
- 第二轮直接在顶层更新值（不再用 `createFields`）
- 魔力消耗后从 50 降到 30，自动限制在 0-100 范围内

---

## 注意事项

1. **慎重创建**：新字段是永久的（除非玩家手动删除），确认四域无法表达后再创建
2. **语义明确**：字段 ID 应清晰表达含义，避免 `x`, `tmp`, `val1` 等模糊命名
3. **上限控制**：最多 32 个自定义字段，超出后旧字段会被截断
4. **只创建一次**：同一字段只在第一次需要时创建，后续直接更新值
5. **JSON 格式**：`createFields` 只在需要时出现，不是必须字段

---

## 常见错误

### ❌ 错误 1：字段 ID 不符合规范
```json
{ "id": "魔力值", ... }          // 包含中文
{ "id": "magic-power", ... }     // 包含连字符
{ "id": "magic power", ... }     // 包含空格
```

### ❌ 错误 2：滥用自定义字段
```json
// 应该用 characters.艾莉丝.affinity
{ "id": "alice_affinity", "type": "number", "value": 5 }
```

### ❌ 错误 3：重复创建
```json
// 第一轮
"createFields": [{ "id": "magic_power", ... }]

// 第二轮（❌ 已存在！）
"createFields": [{ "id": "magic_power", ... }]
```

### ✅ 正确：后续直接更新
```json
// 第二轮
"magic_power": { "type": "number", "value": 80, ... }
```

---

**总结**：自定义字段是强大的扩展能力，但应保守使用，优先用好四域，确保每个字段都有明确且独特的语义。
