# 宿主接缝三条铁律

> 全部来自真机爆炸换来的教训。证据链与逐条 seam 勘察在仓库 `docs/reference/HOST_SEAMS.md`（61 个 slot 实测枚举），本页是对外摘要。

## 铁律一：绝不发明会话事件类型

宿主的会话事件词表是**封闭**的。插件自造 `rrp/state-update` 之类的事件类型，轻则宿主渲染崩溃，重则整条会话日志对宿主不可读。

**正确姿势**：一切持久状态寄存在已知类型 `user/message` 的 `source` 里——

```ts
// src/state-payload.ts
{ type: 'user/message',
  data: { role: 'user', content: [{ type: 'text', text: '…' }],
          source: { kind: 'plugin', plugin: 'dsh-rrp', rrp: { worldState: … } } } }
```

读回用 `rrpPayloadOf(event)`；写全走唯一通道 `publishState()`（卡包/事实两条 lane + 指纹去重）。

## 铁律二：不在陌生 context 上属性读取服务

注入进来的 `Context` 里有什么服务，取决于 profile 组合——直接 `ctx.someService` 取值会在服务缺席时炸。

**正确姿势**：一律 `ctx.get(name)` + undefined 守卫（路由降级空转并 warn，不抛）；agent 生命周期监听器（`agent/created` 等）整体 try/catch——陌生 agent 抛进你的监听器一样炸宿主。

## 铁律三：注入上下文只追加、绝不 replace

前缀缓存是性能命脉：一次 replace 能把缓存命中率从 ~90% 打到 27%（实测）。

**正确姿势**：状态变化 = 追加一条新的 facts 消息，旧消息原地不动；条件注入块文本只由命中集合决定（不嵌实时数值），随状态重发时逐字节不变，让指纹去重把重复 append 抑制掉。玩家矫正、副驾驶代劳、撤销回滚，全部是「追加新事实」，没有「改写历史」。

## 由此得到的红利

- **分支免费正确**：fork 复制日志 + 投影从日志重算 ⇒ 读档时一切状态自动倒回（世界线地图的根基）；
- **热重载干净**：所有注册是可逆 Effect，HMR 释放无残留；
- **宿主升级面小**：只依赖公开 seam 与已知事件类型，版本对账走 `docs/reference/HOST_BASELINE.md`。

## 红线自检（写代码前默念）

- 想 `createServer`？→ 用宿主 webServer 注册 exact route；
- 想自建前端 SPA/弹窗？→ 用 `ctx.slots` + 宿主 primitives；
- 想存自己的 JSON 文件？→ 用宿主存储域（`defineDomain`，原子写链归宿主）；
- 想发明新事件类型？→ 停下来，回到铁律一。
