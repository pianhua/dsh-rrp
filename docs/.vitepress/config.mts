import { defineConfig } from 'vitepress'

export default defineConfig({
  lang: 'zh-CN',
  title: 'DSH-Chronicle',
  description: '挂在 DeepSeek Harness 上的原生单机沉浸式角色扮演插件——动态世界模拟与交互小说引擎。',
  srcExclude: ['reference/**', 'plans/**', 'DESIGN.md', 'HOST_ALIGNMENT.md', 'DEVELOPMENT.md'],
  themeConfig: {
    nav: [
      { text: '玩家手册', link: '/guide/getting-started' },
      { text: '做卡', link: '/authoring/card-anatomy' },
      { text: '开发者', link: '/dev/architecture' },
    ],
    sidebar: {
      '/guide/': [
        {
          text: '玩家手册',
          items: [
            { text: '快速上手', link: '/guide/getting-started' },
            { text: '游玩循环与界面', link: '/guide/play-loop' },
            { text: '月停：全知幕僚', link: '/guide/copilot' },
            { text: '世界线地图（读档）', link: '/guide/worldline' },
            { text: '设定集与条件注入', link: '/guide/lore-and-injection' },
          ],
        },
      ],
      '/authoring/': [
        {
          text: '做卡教程',
          items: [
            { text: '卡包解剖学', link: '/authoring/card-anatomy' },
            { text: '让卡包自带界面', link: '/authoring/card-ui' },
            { text: '技能与 when: 条件注入', link: '/authoring/skills-when' },
            { text: '酒馆卡迁移清单', link: '/authoring/tavern-migration' },
          ],
        },
      ],
      '/dev/': [
        {
          text: '开发者文档',
          items: [
            { text: '架构总览', link: '/dev/architecture' },
            { text: 'HTTP 契约参考', link: '/dev/routes' },
            { text: '宿主接缝三条铁律', link: '/dev/host-seams' },
          ],
        },
      ],
    },
    search: { provider: 'local' },
    outline: { label: '本页目录' },
    docFooter: { prev: '上一页', next: '下一页' },
    footer: { message: 'DSH-Chronicle · 个人单机沉浸式 RP 插件', copyright: 'Host-First：一切依托 DSH 宿主能力' },
  },
})
