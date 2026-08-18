# Custom Start Page · 自定义起始页

一个轻量、无依赖的浏览器起始页（New Tab 替代页）。提供**多引擎搜索、导航卡片、收藏夹、明暗主题、中英双语**；支持**本地加密、云端只存密文**的 S3 同步方案（Cloudflare Pages + Worker）。

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
- **收藏夹**：文件夹树管理收藏网页，支持搜索/标签查询、JSON/HTML 书签导入导出
- **加密云同步**：PBKDF2-SHA256 + AES-256-GCM 本地加密，S3 兼容桶只存密文；支持密钥导出/导入
- **安全加固**：所有用户内容渲染前经过 HTML 转义，链接与自定义图标仅放行 http/https 协议
- **零依赖**：前端纯 HTML + CSS + 原生 JavaScript，无构建工具；后端独立 Cloudflare Worker

## 项目结构

```
├── index.html    # 页面结构（搜索框 + 导航卡片 + 收藏夹 + 设置面板）
├── app.js        # 全部逻辑（渲染、增删改、拖拽、i18n、主题、收藏夹、加密、云同步）
├── style.css     # 样式（明暗双主题、响应式、自定义下拉箭头、收藏夹）
├── config.json   # 默认配置（起始站点列表 + 默认搜索引擎）
├── worker/       # 独立 Cloudflare Worker 后端（S3 密文透传）
│   ├── worker.js
│   └── wrangler.toml.example
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

> 💡 以后每次推送代码到 GitHub 仓库的 `main` 分支，Cloudflare Pages 会自动重新部署，无需手动操作。

### 3. 部署加密同步后端（Cloudflare Worker + S3）

收藏夹与设置的加密云同步需要独立 Worker 后端和 S3 兼容桶。

1. 创建 S3 兼容桶（AWS S3 / Cloudflare R2 / MinIO 等），设为私有。
2. 创建最小权限 AccessKey，仅允许读写 `backup/*` 对象。
3. 部署 `worker/` 目录到 Cloudflare Worker：
   ```bash
   cd worker
   cp wrangler.toml.example wrangler.toml
   # 编辑 wrangler.toml 填入非敏感环境变量
   npx wrangler secret put S3_ACCESS_KEY_ID
   npx wrangler secret put S3_SECRET_ACCESS_KEY
   npx wrangler secret put S3_BUCKET
   npx wrangler deploy
   ```
4. 在设置面板的“云同步”中输入 Worker 地址（如 `https://sync.example.workers.dev`）并启用。

> 关键凭据（S3 AccessKey/Secret、Bucket）全部通过 Worker Secret 配置，不写入代码或前端。

### 4. （可选）绑定自定义域名

在 Pages 项目 → **Custom domains** 中添加你的域名，并按提示在 DNS 处添加 CNAME 记录指向 `*.pages.dev`。

## 使用说明

- **搜索**：输入内容直接搜索；`关键词 + 空格 + 内容` 使用指定引擎；`!内容` 强制使用当前引擎；主界面搜索引擎菜单只影响本次使用，不修改默认引擎
- **添加卡片**：点击网格末尾的 `+` 卡片，填写名称和网址
- **管理卡片**：右键卡片可编辑 / 删除；拖动卡片可排序
- **设置面板**：点击右上角齿轮，可设置默认搜索引擎、管理搜索引擎、语言、主题、布局、收藏夹、云同步、导入导出数据
- **收藏夹**：在设置面板的“收藏夹管理”中新建文件夹/添加收藏、搜索、导入导出；支持 JSON 和浏览器 HTML 书签格式
- **云同步**：启用后，收藏夹和设置使用 PBKDF2-SHA256 + AES-256-GCM 在本地加密，云端 S3 只保存密文；本地仅保存密钥和同步配置
- **数据位置**：未启用云同步时使用本地缓存；启用云同步后业务数据以云端加密数据为权威，不再保存在本地。导出/导入仍可完整备份恢复

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
