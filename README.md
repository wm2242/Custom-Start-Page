# Custom Start Page · 自定义起始页

一个轻量、无依赖的浏览器起始页（New Tab 替代页）。提供**多引擎搜索、导航卡片、明暗主题、中英双语**，所有数据保存在浏览器本地，无需后端服务。

> 本项目主要由 AI 辅助完成。如果你有功能建议或遇到 Bug，欢迎通过 <pilin@wm2242.xyz> 与作者联系。

---

## 功能特性

- **多引擎搜索**：内置 Google / Bing / DuckDuckGo / 百度 / GitHub，支持快捷关键词（如输入 `g xxx` 直接走 Google 搜索）；主界面可临时切换本次使用的搜索引擎，默认搜索引擎在设置面板中设置
- **电脑端定位**：项目面向电脑端使用，不做移动端适配
- **导航卡片**：增删改、拖拽排序、右键菜单，支持自动图标 / 自定义图片 / Emoji 三种图标
- **中英双语**：默认跟随系统语言，可在设置面板手动切换（跟随系统 / 中文 / English）
- **明暗主题**：亮色 / 暗色 / 跟随系统
- **自定义配色**：背景 / 卡片 / 文字 / 次要文字 / 边框五种颜色自由定制，实时预览，一键恢复默认
- **数据管理**：一键导出 / 导入 JSON 配置备份
- **安全加固**：所有用户内容渲染前经过 HTML 转义，链接与自定义图标仅放行 http/https 协议
- **零依赖**：纯 HTML + CSS + 原生 JavaScript，无构建工具，无后端

## 项目结构

```
├── index.html    # 页面结构（搜索框 + 导航卡片 + 设置面板）
├── app.js        # 全部逻辑（渲染、增删改、拖拽、i18n、主题、数据管理）
├── style.css     # 样式（明暗双主题、响应式、自定义下拉箭头）
├── config.json   # 默认配置（起始站点列表 + 默认搜索引擎）
└── README.md
```

## 部署方法（Cloudflare Pages）

### 1. 复刻到自己的 GitHub 仓库

1. 登录 [GitHub](https://github.com)，打开本项目仓库页面
2. 点击右上角 **Fork**，将仓库复制到自己的账号下
3. （可选）在 Fork 后的仓库中修改 `config.json`，填入你自己的默认站点

### 2. 用 Cloudflare Pages 托管

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com)
2. 进入 **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
3. 授权 GitHub，选择刚才 Fork 的仓库
4. 构建配置：
   - **Framework preset**：选 `None`（纯静态站点，无需构建）
   - **Build command**：留空
   - **Build output directory**：填 `/`（项目根目录）
5. 点击 **Save and Deploy**，等待部署完成
6. 部署完成后，Cloudflare 会分配一个 `*.pages.dev` 域名，即可访问

### 3. （可选）绑定自定义域名

在 Pages 项目 → **Custom domains** 中添加你的域名，并按提示在 DNS 处添加 CNAME 记录指向 `*.pages.dev`。

> 💡 以后每次推送代码到 GitHub 仓库的 `main` 分支，Cloudflare Pages 会自动重新部署，无需手动操作。

## 使用说明

- **搜索**：输入内容直接搜索；`关键词 + 空格 + 内容` 使用指定引擎；`!内容` 强制使用当前引擎；主界面搜索引擎菜单只影响本次使用，不修改默认引擎
- **添加卡片**：点击网格末尾的 `+` 卡片，填写名称和网址
- **管理卡片**：右键卡片可编辑 / 删除；拖动卡片可排序
- **设置面板**：点击右上角齿轮，可设置默认搜索引擎、管理搜索引擎、语言、主题、布局、导入导出数据
- **数据位置**：所有配置（站点/布局/引擎/主题/语言）统一保存在浏览器 `localStorage` 的单一 `homepage` key 中，导出/导入即完整备份与恢复；旧版分散存储的数据会在首次加载时自动迁移。清除浏览器数据前请先「导出数据」备份

## 浏览器兼容性

| 浏览器 | 最低版本 | 对应发布时间 |
| --- | --- | --- |
| Chrome | 66+ | 2018-04 |
| Edge | 16+（或新版 Chromium Edge） | 2017-10 |
| Firefox | 52+ | 2017-03 |
| Safari | 11.1+ | 2018-03 |

即 **2018 年及以后发布的现代浏览器**均受支持。

**不支持 IE**：本项目依赖 `fetch`、`Element.closest`、`dataset`、模板字符串、CSS Grid、CSS 变量等 API，IE 无法运行；如需支持 IE 需引入 Babel 转译与多个 polyfill，超出本项目范围。

> 实现说明：代码刻意避免可选链 `?.`、空值合并 `??` 等 ES2020 新语法；flex 容器间距使用 `margin` 实现（兼容不支持 `gap` 的旧 Safari）；`repeat(var(--columns), 96px)` 前留有固定 6 列的兜底声明。

## 联系作者

- 功能建议 / Bug 反馈：**pilin@wm2242.xyz**
- 也欢迎通过 [GitHub Issues](https://github.com/) 提交问题
