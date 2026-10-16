# dsh-rrp · DSH-Chronicle

挂在 [DeepSeek Harness](https://github.com/deepseek) 上的**正统薄插件**——个人单机沉浸式角色扮演与交互小说引擎。

不自建服务器、不自制前端栈、不发明会话事件。一切能力依托宿主，领域只写纯数学折叠。

## 它是什么

- **动态世界模拟**：WorldState 随剧情演进，角色会改变；玩家可在侧边栏直接修改，下一轮即被消费
- **权能分权**：叙事执笔（Author）只写正文、状态推演（Chronicler）只写状态、剧情脉络（Summarizer）管长线方向，三者互不越界
- **原生分支**：世界线映射 DSH 原生 `Session.fork`，投影纯折叠重放，没有「文本回退、数值留在未来」的幽灵状态
- **按需知识**：DSH Skills 渐进披露 + `when:` 确定性条件注入，机制与内容分离
- **卡包自带界面**：舞台（Stage）让卡作者零前端代码也能做 HUD，完整应用则跑在真沙箱里

## 快速上手

```sh
pnpm install          # preinstall 会先校验 Node/pnpm 基线
pnpm run link:dev     # 链接到本机 DSH profile
pnpm test             # 63 个测试文件 / 517 个用例
```

玩家与卡作者的完整指引见发布站点：`pnpm run docs:dev`。

## 文档

领域词义、术语、决策与开发流程分四类真源，各自只有一处：

| 想找什么 | 去哪 |
| :--- | :--- |
| 这个词**是什么、边界在哪** | [`CONTEXT.md`](CONTEXT.md) — 领域词典，31 词条 |
| 中文 UI 名 ↔ 英文标识符、**禁用旧词** | [`docs/reference/GLOSSARY.md`](docs/reference/GLOSSARY.md) |
| **为什么**是这个设计、代价是什么 | [`docs/adr/`](docs/adr/) — 27 篇 ADR，带状态栏与复审登记 |
| 需求流程、开工门与工作日志 | [`docs/dev/workflow.md`](docs/dev/workflow.md) · [`docs/dev/worklog.md`](docs/dev/worklog.md) |

面向玩家与卡作者的教程在 `docs/guide/` 与 `docs/authoring/`，不随仓库分发，可在发布站点阅读。

## 质量门

改动后必须全绿，CI 跑的是同一组：

```sh
pnpm run check:hygiene && pnpm run format:check && pnpm run typecheck && pnpm run lint && pnpm test
```

`check:hygiene` 是仓库卫生门禁——根目录与 `docs/` 分类白名单、文档体积上限、ADR 结构与复审登记、
验收报告命名、站点页面与导航一致性、本地相对链接有效性。六项各对应一条已经付出过代价的真实教训。

## 红线

违反会真机爆炸：

1. **绝不发明会话事件类型**——状态一律寄存在已知 `user/message` 的 `source.rrp` 上；
2. **不在陌生 context 上属性读取服务**——能力用 `ctx.get(name)` 取；智体生命周期监听器整体 `try/catch`；
3. **注入上下文只追加、绝不 replace**——前缀缓存是性能命脉。

项目定位是**个人玩具**：单机单人部署，拒绝分布式锁、多租户鉴权、并发压力测试这类企业级复杂度。
代价换来的是一个人能完整看懂并维护的代码。

## 许可

MIT，见 [LICENSE](LICENSE)。卡包、设定与预设中的第三方内容遵循各自声明的协议。
