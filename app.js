// ============================================================
// 自定义起始页 (Custom Start Page)
// 纯前端：搜索引擎 + 导航卡片 + 主题 + 中英双语
// 数据存储：localStorage 单一 key（homepage，含 sites/layout/engines/engineIndex/theme/lang，见 persist 节）
//
// 代码结构（全部包在 IIFE 内，不污染全局作用域）：
//   utils   —— 通用工具：DOM 快捷查询 / HTML 转义 / URL 白名单 / 存储封装
//   i18n    —— 国际化：字典、当前语言、翻译与静态文案应用
//   state   —— 应用状态（config / engines / editIndex / lang）
//   theme   —— 主题切换
//   dnd     —— 通用拖拽排序（网格 / 引擎列表 / 卡片管理列表共用）
//   engines —— 搜索引擎模块
//   sites   —— 导航卡片模块
//   data    —— 导入导出与布局设置
//   events  —— 事件绑定
//   boot    —— 启动
//
// 不向 window 暴露任何函数：所有动态控件均通过事件委托处理，避免全局命名冲突。
//
// 浏览器兼容性：最低支持 2018 年及以后发布的浏览器
//   Chrome 66+ / Edge 16+ / Firefox 52+ / Safari 11.1+
//   不使用可选链、空值合并等 ES2020 语法；不支持 IE（缺 fetch/Element.closest/
//   模板字符串/CSS Grid 等，需转译与 polyfill 才能运行，本项目不提供）。
// ============================================================
(function () {
  "use strict";

  // ============================================================
  // utils —— 通用工具
  // ============================================================
  const $ = id => document.getElementById(id);

  // HTML 转义，防止 XSS（导入的恶意 JSON 只能显示为纯文本）
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  // URL 协议白名单校验，仅放行 http/https，防止 javascript: 等注入；
  // 无协议输入自动补 https:// 前缀（如 example.com → https://example.com）
  function safeUrl(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "#";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = "https://" + u; // 无协议时补全
    try {
      const p = new URL(u);
      if (p.protocol === "http:" || p.protocol === "https:") return u;
    } catch (e) {}
    return "#";
  }

  // 图片 URL 协议白名单：自定义图标只允许 http/https，避免 data:/javascript: 等
  // 作为 <img src> 引入不可信内容；无协议时按 https:// 补全
  function safeImageUrl(u) {
    u = String(u == null ? "" : u).trim();
    if (!u) return "";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = "https://" + u; // 无协议时补全
    try {
      const p = new URL(u);
      if (p.protocol === "http:" || p.protocol === "https:") return u;
    } catch (e) {}
    return "";
  }

  // localStorage 封装：统一读写模式 + 容错。
  // 隐私模式/禁用存储时读写均不抛异常，回退默认值（参考建议 3.3）
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, value); return true; }
      catch (e) { return false; }
    },
    getJSON(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) { return null; }
    },
    setJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch (e) { return false; }
    }
  };

  // 非阻塞提示条：替代 alert 的原生弹窗，提升体验
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2500);
  }

  // 自定义确认对话框：替代 confirm 的原生弹窗，保持视觉一致
  let confirmCallback = null;
  function showConfirm(msg, onOk) {
    const dialog = $("confirm-dialog");
    if (!dialog) { if (typeof onOk === "function") onOk(); return; }
    $("confirm-message").textContent = msg;
    confirmCallback = onOk;
    dialog.hidden = false;
    const ok = $("confirm-ok");
    if (ok) ok.focus();
  }
  function hideConfirm() {
    const dialog = $("confirm-dialog");
    if (dialog) dialog.hidden = true;
    confirmCallback = null;
  }

  // ============================================================
  // i18n —— 国际化
  // ============================================================
  const I18N = {
    zh: {
      title: "自定义起始页", settings: "设置",
      search_settings: "搜索设置", language: "语言", lang_system: "跟随系统",
      engine_manage: "搜索引擎管理", add_engine: "添加搜索引擎",
      engine_name: "搜索引擎名称", engine_url: "搜索地址", engine_keyword: "快捷关键词",
      save: "保存", cancel: "取消",
      card_manage: "导航卡片管理", add_site: "添加网站",
      site_name: "网站名称", site_url: "网站地址",
      theme_settings: "主题设置", theme_system: "跟随系统", theme_light: "浅色", theme_dark: "深色",
      theme_custom: "自定义配色", color_bg: "背景色", color_card: "卡片色", color_text: "文字色",
      color_secondary: "次要文字色", color_border: "边框色", color_reset: "恢复默认",
      card_display: "卡片显示", columns: "每行卡片数量", hide_cards: "隐藏所有卡片",
      data_manage: "数据管理", export_data: "导出数据", import_data: "导入数据",
      search_placeholder: "搜索网页", search_engine_menu: "选择搜索引擎",
      card_name: "名称", card_url: "网址",
      icon_auto: "自动图标", icon_url: "图片地址", icon_emoji: "Emoji", icon_content: "图标内容",
      add_card: "添加卡片", edit_card: "编辑卡片", delete_card: "删除卡片", delete: "删除",
      keyword: "关键词",
      confirm_delete: "确定删除此卡片？", at_least_one: "至少保留一个搜索引擎",
      keyword_dup: "关键词重复", engine_url_invalid: "搜索地址无效，需包含 %s 或 {query} 占位符",
      import_fail: "导入失败", import_too_large: "备份文件过大（超过 {n} MB）",
      import_version: "备份由更新版本导出，无法导入", import_ok: "导入成功", save_failed: "保存失败：浏览器存储不可用"
    },
    en: {
      title: "Custom Start Page", settings: "Settings",
      search_settings: "Search Settings", language: "Language", lang_system: "System",
      engine_manage: "Search Engine Management", add_engine: "Add Search Engine",
      engine_name: "Search Engine Name", engine_url: "Search URL", engine_keyword: "Shortcut Keyword",
      save: "Save", cancel: "Cancel",
      card_manage: "Shortcut Management", add_site: "Add Site",
      site_name: "Site Name", site_url: "Site URL",
      theme_settings: "Theme Settings", theme_system: "System", theme_light: "Light", theme_dark: "Dark",
      theme_custom: "Custom Colors", color_bg: "Background", color_card: "Card", color_text: "Text",
      color_secondary: "Secondary Text", color_border: "Border", color_reset: "Reset",
      card_display: "Card Display", columns: "Cards per Row", hide_cards: "Hide All Cards",
      data_manage: "Data Management", export_data: "Export Data", import_data: "Import Data",
      search_placeholder: "Search the web", search_engine_menu: "Search engine",
      card_name: "Name", card_url: "URL",
      icon_auto: "Auto Icon", icon_url: "Image URL", icon_emoji: "Emoji", icon_content: "Icon Content",
      add_card: "Add Card", edit_card: "Edit Card", delete_card: "Delete Card", delete: "Delete",
      keyword: "Keyword",
      confirm_delete: "Delete this card?", at_least_one: "Keep at least one search engine",
      keyword_dup: "Keyword already exists", engine_url_invalid: "Invalid search URL — must contain a %s or {query} placeholder",
      import_fail: "Import failed", import_too_large: "Backup file too large (over {n} MB)",
      import_version: "Backup exported by a newer version — cannot import", import_ok: "Imported", save_failed: "Save failed: browser storage unavailable"
    }
  };

  // 语言偏好 lang 在 state 节声明（system/zh/en）

  // 返回实际生效的语言代码（zh/en）
  function curLang() {
    if (lang === "zh") return "zh";
    if (lang === "en") return "en";
    return (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en"; // 跟随系统
  }

  // 按当前语言取翻译文本；缺键时回退中文，再回退键名
  function t(key) {
    const L = curLang();
    return (I18N[L] && I18N[L][key]) || I18N.zh[key] || key;
  }

  // 将 data-i18n 标注的静态文本应用翻译（text/title/placeholder/aria-label）
  function applyI18n() {
    const L = curLang();
    document.documentElement.lang = L === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-title]").forEach(el => {
      const text = t(el.dataset.i18nTitle);
      el.title = text;
      el.setAttribute("aria-label", text);
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  // ============================================================
  // state —— 应用状态（闭包私有，不挂全局）
  // ============================================================
  // 全部持久化数据统一收口在 saveState()/loadState()（单一 key: homepage），
  // 避免分散存储导致导出/导入遗漏（参考建议 6.1）；内存中按职责拆分子对象。
  const DEFAULT_ENGINES = [ // 默认搜索引擎列表（URL 必须含 %s / {query} 占位符）
    { name: "Google",     url: "https://www.google.com/search?q=%s", keyword: "g" },
    { name: "Bing",       url: "https://www.bing.com/search?q=%s",   keyword: "b" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=%s",       keyword: "ddg" },
    { name: "百度",        url: "https://www.baidu.com/s?wd=%s",      keyword: "bd" },
    { name: "GitHub",     url: "https://github.com/search?q=%s",     keyword: "gh" }
  ];
  const defaultLayout = { columns: 6, hide: false };  // 卡片布局默认值

  let config = { sites: [], layout: Object.assign({}, defaultLayout) }; // 站点与布局
  let engines = DEFAULT_ENGINES.slice();               // 搜索引擎列表
  let engineIndex = 0;                                 // 当前引擎索引
  let engineKeywordIndex = new Map();                  // 小写关键词 → 引擎索引（搜索时 O(1) 定位）
  let engineKeywords = new Set();                      // 所有小写关键词集合（查重 O(1)）
  let theme = "system";                                // 主题：system/light/dark
  let lang = "system";                                 // 语言：system/zh/en
  let colors = null;                                   // 自定义配色：{bg,card,text,secondary,border} 或 null=用主题默认
  let editIndex = -1;                                  // 正在编辑的卡片索引（-1 = 新增模式）
  let stateDirty = true;                               // 站点/引擎内容是否需要 sanitizeState
  let engineDirty = true;                              // 关键词索引是否需要重建

  // ============================================================
  // normalize —— 数据校验与归一化（参考建议 3.1 / 3.2）
  // 任何来源（localStorage / config.json / 导入）的数据都经过这里：
  // 逐字段校验类型、修正为合法值、缺失项补默认值，保证渲染永不因数据结构出错。
  // ============================================================
  const ICON_TYPES = ["auto", "url", "emoji"];
  const COLOR_KEYS = ["bg", "card", "text", "secondary", "border"]; // 可自定义配色的 CSS 变量键
  const MAX_SITES = 200;          // 站点/卡片数量上限
  const MAX_ENGINES = 50;         // 搜索引擎数量上限
  const MAX_NAME_LENGTH = 100;    // 名称长度上限
  const MAX_URL_LENGTH = 500;     // URL 长度上限
  const MAX_ICON_LENGTH = 500;    // 图标内容长度上限
  const MAX_KEYWORD_LENGTH = 50;  // 快捷关键词长度上限

  // 自定义配色：5 个颜色必须都是合法 6 位十六进制色值；任一非法则整体回退 null（用主题默认）
  function normalizeColors(c) {
    if (!c || typeof c !== "object") return null;
    const out = {};
    const ok = COLOR_KEYS.every(k => {
      const v = c[k];
      if (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v)) { out[k] = v; return true; }
      return false;
    });
    return ok ? out : null;
  }

  // 站点条目：修正字段类型；URL 非字符串/非法则整条丢弃；图标 URL 仅放行 http/https
  function normalizeSite(s) {
    if (!s || typeof s !== "object" || typeof s.url !== "string") return null;
    const name = typeof s.name === "string" ? s.name.slice(0, MAX_NAME_LENGTH) : "";
    const icon = typeof s.icon === "string" ? s.icon.slice(0, MAX_ICON_LENGTH) : "";
    const url = safeUrl(s.url.slice(0, MAX_URL_LENGTH));
    if (url === "#") return null;
    const iconType = ICON_TYPES.includes(s.iconType) ? s.iconType : "auto";
    const finalIconType = iconType === "url" ? (safeImageUrl(icon) ? "url" : "auto") : iconType;
    return { name, url, iconType: finalIconType, icon };
  }

  // 布局：columns 必须是 2–10 的整数，否则用默认值
  function normalizeLayout(l) {
    const out = Object.assign({}, defaultLayout);
    if (l && typeof l === "object") {
      const cols = Number(l.columns);
      if (Number.isInteger(cols) && cols >= 2 && cols <= 10) out.columns = cols;
      out.hide = !!l.hide;
    }
    return out;
  }

  // 整体状态归一化：统一校验 站点/布局/引擎/引擎索引/主题/语言 并补默认值。
  // search 不再存储——搜索地址由 engines[engineIndex] 派生（参考建议 6.2）
  function normalizeState(data) {
    const out = {
      version: 2,
      sites: [],
      layout: normalizeLayout(),
      engines: DEFAULT_ENGINES.slice(),
      engineIndex: 0,
      theme: "system",
      lang: "system",
      colors: null
    };
    if (!data || typeof data !== "object" || Array.isArray(data)) return out;
    if (Array.isArray(data.sites)) out.sites = data.sites.slice(0, MAX_SITES).map(normalizeSite).filter(s => s !== null);
    out.layout = normalizeLayout(data.layout);
    const eng = normalizeEngines(data.engines);
    if (eng) out.engines = eng.slice(0, MAX_ENGINES);
    const idx = Number(data.engineIndex);
    if (Number.isInteger(idx) && idx >= 0 && idx < out.engines.length) out.engineIndex = idx;
    if (["system", "light", "dark", "custom"].includes(data.theme)) out.theme = data.theme;
    if (["system", "zh", "en"].includes(data.lang)) out.lang = data.lang;
    out.colors = normalizeColors(data.colors);
    return out;
  }

  // 搜索引擎列表：仅保留结构合法且搜索地址可用的条目；整体非法返回 null（沿用默认列表）
  function normalizeEngines(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    list.forEach(e => {
      if (e && typeof e === "object" &&
          typeof e.name === "string" && e.name.trim() &&
          typeof e.url === "string") {
        const name = e.name.slice(0, MAX_NAME_LENGTH);
        const rawUrl = e.url.slice(0, MAX_URL_LENGTH);
        if (!isValidEngineUrl(rawUrl)) return;
        out.push({
          name,
          url: safeUrl(rawUrl),
          keyword: typeof e.keyword === "string" ? e.keyword.slice(0, MAX_KEYWORD_LENGTH) : ""
        });
      }
    });
    return out.length ? out : null;
  }

  // 搜索引擎地址必须包含 %s 或 {query} 占位符：搜索时用查询词替换占位符，
  // 不做任何 URL 字符串拼接，从根本上消除"参数名/查询值"边界缺陷
  function isValidEngineUrl(u) {
    const url = safeUrl(u);
    if (url === "#") return false;
    return url.includes("%s") || url.includes("{query}");
  }

  // 构造搜索链接：仅替换占位符，无拼接逻辑
  function buildSearchUrl(base, query) {
    const url = safeUrl(base);
    if (url === "#") return "#";
    const q = encodeURIComponent(query);
    if (url.includes("%s")) return url.replace(/%s/g, q);
    return url.replace(/\{query\}/g, q);
  }

  // ============================================================
  // persist —— 持久化（统一单一 key，参考建议 6.1）
  // 全部数据（站点/布局/引擎/引擎索引/主题/语言）存进一个 localStorage key，
  // 导出直接序列化它、导入整体恢复，杜绝"分散存储导致遗漏"。
  // ============================================================
  const STATE_VERSION = 2;
  const MAX_IMPORT_SIZE = 5 * 1024 * 1024;  // 导入文件大小上限：5MB（防止解析超大文件卡顿）

  // 重建关键词索引：用于搜索时 O(1) 定位引擎、编辑时 O(1) 查重
  function rebuildEngineIndex() {
    const index = new Map();
    const keywords = new Set();
    engines.forEach((e, i) => {
      const k = (e.keyword || "").trim().toLowerCase();
      if (!k) return;
      if (!index.has(k)) index.set(k, i);
      keywords.add(k);
    });
    engineKeywordIndex = index;
    engineKeywords = keywords;
    engineDirty = false;
  }

  function markStateDirty() { stateDirty = true; }
  function markEngineDirty() { engineDirty = true; stateDirty = true; }

  // 仅在数据发生变更时执行截断/限量与索引重建，避免每次保存都全量扫描
  function ensureStateClean() {
    if (stateDirty) {
      sanitizeState();
      stateDirty = false;
    }
    if (engineDirty) {
      rebuildEngineIndex();
    }
  }

  // 写入前统一截断/限量：运行时的新增/编辑同样受 MAX_* 约束，
  // 避免"保存时不限制、刷新后才被归一化截断"的不一致（load/import 已由 normalize 处理）
  function sanitizeState() {
    if (Array.isArray(config.sites)) {
      config.sites = config.sites.slice(0, MAX_SITES)
        .map(normalizeSite).filter(s => s !== null);
    }
    if (Array.isArray(engines)) {
      engines = engines.slice(0, MAX_ENGINES).map(e => {
        if (!e || typeof e !== "object") return null;
        return {
          name: typeof e.name === "string" ? e.name.slice(0, MAX_NAME_LENGTH) : "",
          url: typeof e.url === "string" ? e.url.slice(0, MAX_URL_LENGTH) : "",
          keyword: typeof e.keyword === "string" ? e.keyword.slice(0, MAX_KEYWORD_LENGTH) : ""
        };
      }).filter(e => e && e.name.trim() && e.url);
      engineIndex = Math.min(engineIndex, Math.max(0, engines.length - 1));
    }
  }

  // 把内存状态整体写入单一 key；顺带清理迁移前遗留的旧 key。返回写入的数据对象
  function saveState() {
    ensureStateClean(); // 按需截断/限量 + 重建关键词索引
    const data = {
      version: STATE_VERSION,
      sites: config.sites,
      layout: config.layout,
      engines,
      engineIndex: getEngineIndex(),
      theme,
      lang,
      colors
    };
    if (!store.setJSON("homepage", data)) {
      toast(t("save_failed"));
    }
    // 迁移清理：旧版分散的 key 不再使用
    ["engines", "engineIndex", "theme", "lang"].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    return data;
  }

  // 读取统一状态；若为旧格式（无 version 或散落旧 key），合并迁移为统一结构；
  // 全新用户（无任何本地数据）返回 null，由调用方回退 config.json
  function loadState() {
    const raw = store.getJSON("homepage");
    if (raw && raw.version === STATE_VERSION) return raw;
    const legacyEngines = store.getJSON("engines");
    const legacyIndex = store.get("engineIndex", null);
    const legacyTheme = store.get("theme", null);
    const legacyLang = store.get("lang", null);
    if (!raw && !legacyEngines && legacyIndex === null && legacyTheme === null && legacyLang === null) {
      return null; // 全新用户：无任何本地数据
    }
    return {
      version: STATE_VERSION,
      sites: raw && raw.sites,
      layout: raw && raw.layout,
      engines: (raw && raw.engines) || legacyEngines,
      engineIndex: (raw && raw.engineIndex !== undefined) ? raw.engineIndex : Number(legacyIndex || 0),
      theme: (raw && raw.theme) || legacyTheme || "system",
      lang: (raw && raw.lang) || legacyLang || "system"
    };
  }

  // 把归一化后的数据应用到内存状态
  function applyState(data) {
    config.sites = data.sites;
    config.layout = data.layout;
    engines = data.engines;
    engineIndex = data.engineIndex;
    theme = data.theme;
    lang = data.lang;
    colors = data.colors;
    markStateDirty();
    markEngineDirty();
  }

  // 当前搜索地址：由引擎列表与索引派生，永不与 engineIndex 失步（参考建议 6.2）
  function currentSearch() {
    return engines[getEngineIndex()].url;
  }

  // ============================================================
  // theme —— 主题
  // ============================================================
  // 应用主题：dark / light / system（跟随系统 prefers-color-scheme）
  function applyTheme() {
    const mode = theme;
    document.body.classList.remove("dark");
    if (mode === "dark" ||
        (mode === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.body.classList.add("dark");
    }
  }

  // 应用自定义配色：仅当主题模式为"custom"时生效（内联 CSS 变量优先级最高，
  // 同时覆盖亮/暗两套主题变量）；否则移除内联覆盖，恢复主题默认色
  function applyColors() {
    const root = document.body;
    if (theme !== "custom" || !colors) {
      COLOR_KEYS.forEach(k => root.style.removeProperty("--" + k));
      return;
    }
    COLOR_KEYS.forEach(k => root.style.setProperty("--" + k, colors[k]));
  }

  // 主题模式为"自定义配色"时显示配色配置面板，否则隐藏
  function syncColorPanel() {
    const colorForm = $("color-form");
    if (colorForm) colorForm.classList.toggle("show", theme === "custom");
  }

  // 同步设置面板中的颜色取色器显示值（面板打开时也用于导入后刷新）
  function syncColorInputs() {
    COLOR_KEYS.forEach(k => {
      const el = $("color-" + k);
      if (!el) return;
      el.value = colors ? colors[k] :
        getComputedStyle(document.body).getPropertyValue("--" + k).trim() || el.value;
    });
  }

  // ============================================================
  // dnd —— 通用拖拽排序（事件委托版，参考建议 4.1）
  // 只在容器上绑定一次事件，内部元素增删/重建都无需重新绑定监听器：
  //   getItems() 返回可变的源数组；drop 成功后调用 commit()（保存 + 重渲染）
  // ============================================================
  function attachDelegatedDragSort(container, getItems, commit) {
    container.addEventListener("dragstart", e => {
      const item = e.target.closest('[draggable="true"]'); // 编辑模式（draggable=false）不参与拖拽
      if (!item) return;
      // 从输入控件发起拖拽会干扰文本选取与编辑，取消拖拽（双保险）
      if (e.target.closest("input, select, button, textarea")) {
        e.preventDefault();
        return;
      }
      e.dataTransfer.setData("index", item.dataset.index);
      item.classList.add("dragging");
    });
    container.addEventListener("dragend", e => {
      const item = e.target.closest('[draggable="true"]');
      if (item) item.classList.remove("dragging");
    });
    container.addEventListener("dragover", e => {
      if (e.target.closest('[draggable="true"]')) e.preventDefault(); // 允许放置
    });
    container.addEventListener("drop", e => {
      const target = e.target.closest('[draggable="true"]');
      if (!target) return;
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("index"));
      const to = Number(target.dataset.index);
      if (Number.isNaN(from) || from === to) return;
      const items = getItems();
      const moved = items.splice(from, 1)[0];
      if (!moved) return;
      items.splice(to, 0, moved);
      commit();
    });
  }

  // ============================================================
  // engines —— 搜索引擎模块
  // ============================================================

  // 读取并校验当前引擎索引（越界回退 0）
  function getEngineIndex() {
    let i = Number(engineIndex);
    if (Number.isNaN(i) || i < 0 || i >= engines.length) i = 0;
    return i;
  }

  // 设置引擎索引（越界回退 0），立即持久化，返回实际生效的索引
  function setEngineIndex(i) {
    i = Number(i);
    if (Number.isNaN(i) || i < 0 || i >= engines.length) i = 0;
    engineIndex = i;
    saveState();
    return i;
  }

  // 同步下拉框：重建选项并恢复选中（search 由 engines[engineIndex] 派生，无需存储）
  function syncEngineSelect() {
    const select = $("engine");
    select.innerHTML = engines
      .map((e, i) => `<option value="${i}">${escapeHtml(e.name)}</option>`)
      .join("");
    select.value = getEngineIndex();
  }

  // 设置面板：搜索引擎管理列表（可拖拽排序、内联编辑、删除）
  function renderEngineList() {
    const box = $("engine-list");
    box.innerHTML = engines.map((e, i) => `
<div class="engine-sort-item" draggable="true" data-index="${i}">
  <div class="engine-title" data-action="toggle-engine" data-index="${i}" tabindex="0" role="button" aria-expanded="false">
    <span>${i + 1}. ${escapeHtml(e.name)}</span>
    <span>⌄</span>
  </div>
  <div class="engine-detail" id="engine-detail-${i}">
    <input value="${escapeHtml(e.name)}" data-action="edit-engine" data-index="${i}" data-field="name">
    <input value="${escapeHtml(e.url)}" data-action="edit-engine" data-index="${i}" data-field="url">
    <input value="${escapeHtml(e.keyword || "")}" placeholder="${escapeHtml(t('keyword'))}" data-action="edit-engine" data-index="${i}" data-field="keyword">
    <button data-action="delete-engine" data-index="${i}">${escapeHtml(t('delete'))}</button>
  </div>
</div>`).join("");
    // 拖拽排序与所有动态控件均由 bindEvents 中的事件委托统一处理
  }

  // 搜索框旁的引擎快捷切换菜单（当前引擎置顶）
  function renderSearchEngineMenu() {
    const menu = $("search-engine-menu");
    if (!menu) return;
    const idx = getEngineIndex();
    const items = [];
    engines.forEach((e, i) => {
      if (i === idx) return;
      items.push([i, e]);
    });
    items.unshift([idx, engines[idx]]);
    menu.innerHTML = items.map(pair => {
      const i = pair[0];
      const e = pair[1];
      const cls = i === idx ? "search-engine-item active" : "search-engine-item";
      return `<div class="${cls}" data-action="change-engine" data-index="${i}" role="button" tabindex="0" aria-current="${i === idx ? "true" : "false"}">${escapeHtml(e.name)}</div>`;
    }).join("");
  }

  // 仅当菜单打开时才重绘快捷菜单（关闭时跳过，避免无谓重绘，参考建议 4.2）
  function refreshSearchMenu() {
    const menu = $("search-engine-menu");
    if (menu && menu.classList.contains("open")) renderSearchEngineMenu();
  }

  // 打开/关闭引擎快捷切换菜单，并同步按钮箭头（⌃/⌄）
  function setSearchMenuOpen(open) {
    const menu = $("search-engine-menu");
    if (!menu) return;
    if (open && !menu.classList.contains("open")) renderSearchEngineMenu(); // 打开前先渲染
    menu.classList.toggle("open", open);
    const btn = $("search-engine-btn");
    if (btn) {
      btn.textContent = open ? "⌃" : "⌄";
      btn.setAttribute("aria-expanded", String(open));
    }
  }

  // 刷新全部引擎相关视图（下拉框 + 管理列表 + 快捷菜单）
  function renderEngines() {
    syncEngineSelect();
    renderEngineList();
    refreshSearchMenu();
  }

  // 展开/收起列表项的编辑区（引擎与卡片共用，prefix 区分元素 id 前缀）
  function toggleDetail(prefix, i) {
    const box = $(prefix + "-" + i);
    if (!box) return;
    const open = !box.classList.contains("open");
    box.classList.toggle("open", open);
    // 编辑模式（详情展开）下禁用该行拖拽，避免 draggable 干扰输入框文字选取
    const item = box.closest("[draggable]");
    if (item) item.draggable = !open;
    const title = box.previousElementSibling;
    if (title) {
      const arrow = title.querySelector("span:last-child");
      if (arrow) arrow.textContent = open ? "⌃" : "⌄";
      title.setAttribute("aria-expanded", String(open));
    }
  }

  function toggleEngineDetail(i) { toggleDetail("engine-detail", i); }

  // 编辑引擎字段（name/url/keyword）；url 校验搜索地址、keyword 校验重复
  function editEngine(i, key, value) {
    if (key === "url" && !isValidEngineUrl(value)) { toast(t("engine_url_invalid")); return; }
    if (key === "keyword" && !keywordUnique(value, i)) { toast(t("keyword_dup")); return; }
    engines[i][key] = value.trim();
    markEngineDirty();
    saveState();
    renderEngines();
  }

  // 删除引擎（至少保留一个）
  function deleteEngine(i) {
    if (engines.length <= 1) { toast(t("at_least_one")); return; }
    engines.splice(i, 1);
    // 原选中引擎被删（索引越界）→ 收敛到最后一项；未越界则保持原选中
    if (engineIndex >= engines.length) engineIndex = engines.length - 1;
    markEngineDirty();
    saveState();
    renderEngines();
  }

  // 切换当前搜索引擎
  function changeEngine(i) {
    const idx = setEngineIndex(i);  // 同时持久化 engineIndex
    $("engine").value = idx;
    setSearchMenuOpen(false); // 选择后关闭菜单并复位箭头
  }

  // 检查快捷关键词是否重复（排除 excludeIndex 对应的引擎；-1 = 全部检查）
  function keywordUnique(k, excludeIndex) {
    k = (k || "").trim().toLowerCase();
    if (!k) return true;
    // 编辑时允许保留自身原有关键词
    if (excludeIndex >= 0 && engines[excludeIndex] &&
        (engines[excludeIndex].keyword || "").trim().toLowerCase() === k) {
      return true;
    }
    return !engineKeywords.has(k);
  }

  // 添加新搜索引擎（表单提交）
  function addEngine() {
    const nameEl = $("engine-name");
    const urlEl = $("engine-url");
    const keyEl = $("engine-keyword");
    const keyword = keyEl.value.trim().toLowerCase();
    if (!nameEl.value.trim() || !urlEl.value.trim()) return;
    if (!isValidEngineUrl(urlEl.value)) { toast(t("engine_url_invalid")); return; }
    if (!keywordUnique(keyword, -1)) { toast(t("keyword_dup")); return; }
    engines.push({ name: nameEl.value.trim(), url: urlEl.value.trim(), keyword });
    markEngineDirty();
    saveState();
    renderEngines();
    nameEl.value = ""; urlEl.value = ""; keyEl.value = "";
    $("engine-form").classList.remove("show");
    $("show-engine-form").setAttribute("aria-expanded", "false");
  }

  // ============================================================
  // sites —— 导航卡片模块
  // ============================================================

  // 站点图标三级回退：favicon.ico → favicon.svg → Google favicon → 占位地球
  function faviconFallback(img, host) {
    if (!img.dataset.svg) { img.dataset.svg = "1"; img.src = "https://" + host + "/favicon.svg"; return; }
    if (!img.dataset.google) { img.dataset.google = "1"; img.src = "https://www.google.com/s2/favicons?domain=" + host + "&sz=64"; return; }
    // 到占位地球后移除监听标记：后续 error 事件不再重复触发回退
    img.removeAttribute("data-favicon-host");
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23ccc'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-size='32'%3E🌐%3C/text%3E%3C/svg%3E";
  }

  // 按图标类型生成图标 HTML（网格卡片与编辑器共用）
  function siteIcon(site, host) {
    if (site.iconType === "emoji") return `<span>${escapeHtml(site.icon || "🌐")}</span>`;
    if (site.iconType === "url") {
      const icon = safeImageUrl(site.icon);
      if (icon) return `<img src="${escapeHtml(icon)}" data-custom-icon="1" data-fallback-host="${escapeHtml(host)}">`;
      return `<span>${escapeHtml(site.icon || "🌐")}</span>`; // 非法/空图片 URL 回退文字占位
    }
    return `<img src="https://${escapeHtml(host)}/favicon.ico" data-favicon-host="${escapeHtml(host)}">`;
  }

  // 图标类型下拉选项（编辑器复用）
  function iconTypeOptions(current) {
    return [
      ["auto", "icon_auto"],
      ["url", "icon_url"],
      ["emoji", "icon_emoji"]
    ].map(([v, key]) =>
      `<option value="${v}" ${current === v ? "selected" : ""}>${escapeHtml(t(key))}</option>`
    ).join("");
  }

  // 创建单张卡片 DOM（供全量渲染与增量添加共用）
  function createShortcut(site, i) {
    let host;
    try { host = new URL(site.url).hostname; } catch (e) { return null; }
    const link = document.createElement("a");
    link.className = "shortcut";
    link.href = safeUrl(site.url);
    link.target = "_blank";
    link.rel = "noopener";
    link.draggable = true;
    link.dataset.index = i;
    link.innerHTML = `
<div class="shortcut-icon">${siteIcon(site, host)}</div>
<div class="shortcut-title">${escapeHtml(site.name)}</div>`;
    return link;
  }

  // 设置面板中的单条卡片管理项 HTML
  function renderEditorItem(site, i) {
    return `
<div class="card-sort-item" draggable="true" data-index="${i}">
  <div class="card-title" data-action="toggle-card" data-index="${i}" tabindex="0" role="button" aria-expanded="false">
    <span>${i + 1}. ${escapeHtml(site.name)}</span>
    <span>⌄</span>
  </div>
  <div class="card-detail" id="card-detail-${i}">
    <input value="${escapeHtml(site.name || "")}" data-action="edit-card" data-index="${i}" data-field="name">
    <input value="${escapeHtml(site.url || "")}" data-action="edit-card" data-index="${i}" data-field="url">
    <select data-action="edit-card" data-index="${i}" data-field="iconType">${iconTypeOptions(site.iconType || "auto")}</select>
    <input value="${escapeHtml(site.icon || "")}" data-action="edit-card" data-index="${i}" data-field="icon">
    <button data-action="remove-card" data-index="${i}">${escapeHtml(t('delete'))}</button>
  </div>
</div>`;
  }

  // 重新校正网格与设置面板中卡片节点的 data-index / id / 序号
  function reindexSiteViews() {
    document.querySelectorAll("#sites a.shortcut").forEach((el, idx) => { el.dataset.index = idx; });
    document.querySelectorAll("#editor .card-sort-item").forEach((el, idx) => {
      const site = config.sites[idx];
      if (!site) return;
      el.dataset.index = idx;
      const title = el.querySelector(".card-title");
      if (title) {
        title.dataset.index = idx;
        const num = title.querySelector("span:first-child");
        if (num) num.textContent = `${idx + 1}. ${site.name}`;
      }
      const detail = el.querySelector(".card-detail");
      if (detail) detail.id = "card-detail-" + idx;
      el.querySelectorAll("[data-index]").forEach(ctl => { ctl.dataset.index = idx; });
    });
  }

  // 渲染主页面：卡片网格 + 添加卡片 + 设置面板编辑器
  function renderSites() {
    const box = $("sites");
    if (!box || !Array.isArray(config.sites)) return;  // 防御：数据未就绪时安全返回
    box.innerHTML = "";
    box.style.setProperty("--columns", config.layout.columns || 6);
    const hidden = !!config.layout.hide;
    box.style.display = hidden ? "none" : "grid";
    renderEditor();
    if (hidden) return;

    config.sites.forEach((site, i) => {
      const link = createShortcut(site, i);
      if (link) box.appendChild(link);
    });

    // 末尾的"添加卡片"占位卡片
    const addCard = document.createElement("div");
    addCard.className = "shortcut add-card";
    addCard.dataset.action = "add-card";
    addCard.innerHTML = `<div class="shortcut-icon add-icon">+</div><div class="shortcut-title">${escapeHtml(t('add_card'))}</div>`;
    box.appendChild(addCard);
  }

  // 设置面板：导航卡片管理列表（可拖拽排序、内联编辑）
  function renderEditor() {
    const box = $("editor");
    if (!box || !Array.isArray(config.sites)) return;  // 防御：数据未就绪时安全返回
    box.innerHTML = config.sites.map((site, i) => renderEditorItem(site, i)).join("");
  }

  // 增量新增卡片视图：仅在网格末尾追加，不整页重建 DOM
  function appendSiteView(index) {
    const site = config.sites[index];
    if (!site) return;
    const grid = $("sites");
    if (grid && grid.style.display !== "none") {
      const link = createShortcut(site, index);
      if (link) grid.insertBefore(link, grid.querySelector(".add-card"));
    }
    if ($("panel").style.display === "block") {
      const editor = $("editor");
      if (editor) editor.insertAdjacentHTML("beforeend", renderEditorItem(site, index));
    }
  }

  // 增量删除卡片视图：仅移除对应 DOM 并重排后续索引
  function removeSiteView(index) {
    const cardEl = document.querySelector(`#sites a.shortcut[data-index="${index}"]`);
    if (cardEl) cardEl.remove();
    const itemEl = document.querySelector(`#editor .card-sort-item[data-index="${index}"]`);
    if (itemEl) itemEl.remove();
    reindexSiteViews();
  }

  // 只更新第 i 张卡片对应的 DOM（网格卡片 + 设置面板列表项），避免整页重绘（参考建议 4.1）
  function syncSiteViews(i) {
    const site = config.sites[i];
    if (!site) return;
    // 网格卡片
    const cardEl = document.querySelector(`#sites a.shortcut[data-index="${i}"]`);
    if (cardEl) {
      cardEl.href = safeUrl(site.url);
      const titleEl = cardEl.querySelector(".shortcut-title");
      if (titleEl) titleEl.textContent = site.name;
      let host = null;
      try { host = new URL(site.url).hostname; } catch (e) {}
      if (host) {
        const iconBox = cardEl.querySelector(".shortcut-icon");
        if (iconBox) iconBox.innerHTML = siteIcon(site, host);
      }
    }
    // 设置面板列表项
    const item = document.getElementById("card-detail-" + i);
    if (item) {
      const title = item.closest(".card-sort-item").querySelector(".card-title span");
      if (title) title.textContent = `${i + 1}. ${site.name}`;
      const inputs = item.querySelectorAll("input");
      if (inputs[0]) inputs[0].value = site.name || "";
      if (inputs[1]) inputs[1].value = site.url || "";
      if (inputs[2]) inputs[2].value = site.icon || "";
      const sel = item.querySelector("select");
      if (sel) sel.value = site.iconType || "auto";
    }
  }

  // 右键弹出卡片操作菜单
  function showCardMenu(index, x, y) {
    removeCardMenu();
    const menu = document.createElement("div");
    menu.id = "card-menu";
    menu.innerHTML = `
<div data-action="edit-card-menu" data-index="${index}">${escapeHtml(t('edit_card'))}</div>
<div data-action="delete-card-menu" data-index="${index}">${escapeHtml(t('delete_card'))}</div>
<div data-action="cancel-card-menu">${escapeHtml(t('cancel'))}</div>`;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
  }

  function removeCardMenu() {
    const menu = $("card-menu");
    if (menu) menu.remove();
  }

  // 打开卡片编辑器（填充现有数据）
  function editCard(i) {
    if (!config.sites[i]) return;
    editIndex = i;
    const card = config.sites[i];
    $("card-name").value = card.name || "";
    $("card-url").value = card.url || "";
    $("card-icon-type").value = card.iconType || "auto";
    $("card-icon").value = card.icon || "";
    $("card-editor").classList.add("open");
  }

  // 删除卡片（带自定义确认对话框）
  function removeCard(i) {
    if (!config.sites[i]) return;
    showConfirm(t("confirm_delete"), () => {
      config.sites.splice(i, 1);
      markStateDirty();
      saveState();
      if (config.layout.hide) renderSites(); else removeSiteView(i);
    });
  }

  // 保存卡片（新增或更新）
  function saveCard() {
    const nameEl = $("card-name");
    const urlEl = $("card-url");
    const typeEl = $("card-icon-type");
    const iconEl = $("card-icon");
    if (!urlEl.value.trim()) return;
    const rawIcon = iconEl.value.trim();
    const isUrlType = typeEl.value === "url";
    const iconType = isUrlType && safeImageUrl(rawIcon) ? "url" : isUrlType ? "auto" : typeEl.value;
    const data = {
      name: nameEl.value.trim() || urlEl.value.trim(),
      url: safeUrl(urlEl.value.trim()),
      iconType,
      icon: rawIcon
    };
    if (data.url === "#") return; // 非法 URL 拒绝保存
    if (editIndex >= config.sites.length) editIndex = -1;
    if (editIndex >= 0) {
      // 编辑既有卡片：就地更新对应 DOM，避免整页重绘（参考建议 4.1）
      config.sites[editIndex] = data;
      markStateDirty();
      saveState();
      syncSiteViews(editIndex);
    } else {
      // 新增卡片：仅在网格末尾增量追加，避免整页重绘
      const newIndex = config.sites.length;
      config.sites.push(data);
      markStateDirty();
      saveState();
      if (config.layout.hide) renderSites(); else appendSiteView(newIndex);
    }
    closeCardEditor();
  }

  // 关闭卡片编辑器
  function closeCardEditor() {
    editIndex = -1;
    $("card-editor").classList.remove("open");
  }

  // 展开/收起单个卡片编辑区
  function toggleCardDetail(i) { toggleDetail("card-detail", i); }

  // 内联编辑卡片字段（url 字段做协议校验）；就地更新对应 DOM，不整页重绘
  function editCardValue(i, key, value) {
    if (!config.sites[i]) return;
    if (key === "url") {
      value = safeUrl(value);
      if (value === "#") return;
    }
    if (key === "iconType" && value === "url" && !safeImageUrl(config.sites[i].icon || "")) {
      value = "auto"; // 图片地址非法时不允许切到 url 图标，并清空脏图标
      config.sites[i].icon = "";
    }
    if (key === "icon" && config.sites[i].iconType === "url" && !safeImageUrl(value)) {
      config.sites[i].iconType = "auto";
      value = "";
    }
    config.sites[i][key] = value;
    markStateDirty();
    saveState();
    syncSiteViews(i);
  }

  // 添加新网站（表单提交）
  function addSite() {
    const nameEl = $("site-name");
    const urlEl = $("site-url");
    if (!urlEl.value.trim()) return;
    const data = {
      name: nameEl.value.trim() || urlEl.value.trim(),
      url: safeUrl(urlEl.value.trim())
    };
    if (data.url === "#") return; // 非法 URL 拒绝保存
    const newIndex = config.sites.length;
    config.sites.push(data);
    markStateDirty();
    saveState();
    if (config.layout.hide) renderSites(); else appendSiteView(newIndex);
    nameEl.value = "";
    urlEl.value = "";
    $("site-form").classList.remove("show");
    $("show-site-form").setAttribute("aria-expanded", "false");
  }

  // ============================================================
  // data —— 数据管理与布局
  // ============================================================

  // 当前时间戳：YYYYMMDD-HHMMSS（用于备份文件名，避免同名覆盖）
  function timestamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, "0");
    return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
      "-" + p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  }

  // 导出全部配置为 JSON 文件：直接序列化统一状态（含 version），文件名带时间戳
  function exportData() {
    const blob = new Blob([JSON.stringify(saveState(), null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    const url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "homepage-backup-" + timestamp() + ".json";
    a.click();
    // 释放临时 Blob URL，避免长期占用内存
    if (URL.revokeObjectURL) {
      const revoke = URL.revokeObjectURL.bind(URL);
      setTimeout(() => revoke(url), 0);
    }
  }

  // 从 JSON 文件导入配置（渲染时已有 esc/safeUrl 防护；结构经 normalize 校验）
  // 导入前先做两道防线：文件大小上限 + 备份版本号校验
  function importData(file) {
    if (file.size > MAX_IMPORT_SIZE) {
      toast(t("import_too_large").replace("{n}", String(MAX_IMPORT_SIZE / 1024 / 1024)));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        // 版本校验：更高版本导出的备份结构未知，拒绝导入（缺失/旧版本则照常归一化）
        const v = data && data.version;
        if (typeof v === "number" && v > STATE_VERSION) {
          toast(t("import_version"));
          return;
        }
        applyState(normalizeState(data));  // 站点/布局/引擎/索引/主题/语言/配色整体归一化导入
        saveState();
        // 导入的主题/语言/配色立即生效（无需刷新页面）
        applyI18n();
        applyTheme();
        applyColors();
        syncColorPanel();
        syncColorInputs();
        renderEngines();
        renderSites();
        toast(t("import_ok"));
      } catch (e) { toast(t("import_fail")); }
    };
    reader.readAsText(file);
  }

  // 更新卡片布局（每行数量 / 隐藏）
  function updateLayout() {
    const input = $("card-columns");
    const hide = $("hide-cards");
    const n = Number(input.value);
    if (n >= 2 && n <= 10) config.layout.columns = n;
    config.layout.hide = hide.checked;
    saveState();
    renderSites();
  }

  // ============================================================
  // events —— 事件绑定
  // ============================================================

  // 关闭所有弹出窗口（面板/引擎菜单/卡片编辑器/右键菜单）
  function closeAllPopups() {
    const panel = $("panel");
    if (panel) panel.style.display = "none";
    const settings = $("settings");
    if (settings) settings.setAttribute("aria-expanded", "false");
    setSearchMenuOpen(false); // 关闭引擎菜单并复位按钮箭头
    const cardEditor = $("card-editor");
    if (cardEditor) cardEditor.classList.remove("open");
    removeCardMenu();
    hideConfirm();
  }

  function navigate(url) {
    // 先派发一个自定义事件，便于测试/统计在不跳转的情况下捕获目标 URL
    try { document.dispatchEvent(new CustomEvent("startpage:navigate", { detail: { url } })); } catch (e) {}
    try { location.href = url; } catch (e) { /* 个别测试环境（如 jsdom）未实现导航跳转 */ }
  }

  // 折叠/展开静态面板（设置面板中的折叠标题）
  function toggleCollapse(targetId) {
    const box = $(targetId);
    const title = document.querySelector(`[data-target="${targetId}"]`);
    if (!box) return;
    const open = !box.classList.contains("open");
    box.classList.toggle("open", open);
    if (title) {
      const arrow = title.querySelector("span:last-of-type");
      if (arrow) arrow.textContent = open ? "⌃" : "⌄";
      title.setAttribute("aria-expanded", String(open));
    }
  }

  // 打开新增卡片编辑器
  function openAddCard() {
    editIndex = -1;
    $("card-name").value = "";
    $("card-url").value = "";
    $("card-icon-type").value = "auto";
    $("card-icon").value = "";
    $("card-editor").classList.add("open");
  }

  // 自定义配色相关事件
  function bindColorEvents() {
    // 从 5 个颜色输入框收集当前值（不持久化）
    function collectColorValues() {
      const obj = {};
      COLOR_KEYS.forEach(k => { obj[k] = $("color-" + k).value; });
      return obj;
    }
    // 实时预览：只改内联变量，不动已保存的 colors
    function previewColors() {
      const root = document.body;
      COLOR_KEYS.forEach(k => root.style.setProperty("--" + k, $("color-" + k).value));
    }
    COLOR_KEYS.forEach(k => {
      const el = $("color-" + k);
      if (!el) return;
      el.addEventListener("input", previewColors);  // 取色过程实时预览
      el.addEventListener("change", previewColors); // 取色器确认后仍先预览
    });
    // 配色配置面板的显示由主题模式（custom）控制（见 syncColorPanel），
    // 面板内三个按钮只处理颜色本身
    $("color-save").onclick = () => {
      colors = collectColorValues();  // 保存：提交为正式配色并持久化
      saveState();
      applyColors();
    };
    $("color-cancel").onclick = () => {
      applyColors();      // 取消：撤销预览，恢复已保存配色（无则用主题默认）
      syncColorInputs();
    };
    $("color-reset").onclick = () => {
      colors = null;      // 恢复默认：清除配色并持久化
      saveState();
      applyColors();
      syncColorInputs();
    };
  }

  // 搜索提交逻辑
  function bindSearchEvents() {
    // 支持三种输入：`关键词 内容`（用快捷关键词引擎）、`!内容`（当前引擎）、普通搜索
    $("search").addEventListener("submit", e => {
      e.preventDefault();
      let query = $("query").value.trim();
      if (!query) return;
      const parts = query.split(/\s+/);
      const first = parts[0].toLowerCase();

      // 快捷关键词：`g xxx` → Google 搜索 xxx（用 Map 索引 O(1) 定位）
      const keywordEngineIndex = engineKeywordIndex.get(first);
      if (keywordEngineIndex !== undefined) {
        query = parts.slice(1).join(" ");
        if (query) navigate(buildSearchUrl(engines[keywordEngineIndex].url, query));
        return;
      }

      // `!xxx` → 强制用当前引擎
      if (query.startsWith("!")) {
        query = query.slice(1).trim();
        navigate(buildSearchUrl(currentSearch(), query));
        return;
      }

      navigate(buildSearchUrl(currentSearch(), query));
    });
  }

  // 图片加载失败统一处理：自定义图片回退 favicon，favicon 三级回退
  function bindImageFallbackEvents() {
    document.addEventListener("error", e => {
      const img = e.target;
      if (!img || !img.matches) return;
      // 自定义图片加载失败：回退到该站点 favicon，再走 favicon 三级回退
      if (img.matches("img[data-custom-icon]")) {
        const host = img.dataset.fallbackHost;
        if (host) {
          img.removeAttribute("data-custom-icon");
          img.removeAttribute("data-fallback-host");
          img.src = "https://" + host + "/favicon.ico";
          img.dataset.faviconHost = host;
        }
        return;
      }
      if (img.matches("img[data-favicon-host]")) {
        faviconFallback(img, img.dataset.faviconHost);
      }
    }, true);
  }

  function bindEvents() {
    // ---- 动态控件事件委托：所有 data-action 统一处理，无需全局函数 -------
    document.addEventListener("click", e => {
      const t = e.target;
      const actionEl = t.closest("[data-action]");
      if (actionEl) {
        const action = actionEl.dataset.action;
        const index = Number(actionEl.dataset.index);
        switch (action) {
          case "toggle-engine": toggleEngineDetail(index); return;
          case "delete-engine": deleteEngine(index); return;
          case "change-engine": changeEngine(index); return;
          case "toggle-card": toggleCardDetail(index); return;
          case "remove-card": removeCard(index); return;
          case "edit-card-menu": editCard(index); removeCardMenu(); return;
          case "delete-card-menu": removeCard(index); removeCardMenu(); return;
          case "cancel-card-menu": removeCardMenu(); return;
          case "add-card": openAddCard(); return;
          case "collapse": toggleCollapse(actionEl.dataset.target); return;
          case "confirm-ok": {
            if (typeof confirmCallback === "function") {
              const cb = confirmCallback;
              hideConfirm();
              cb();
            }
            return;
          }
          case "confirm-cancel": hideConfirm(); return;
        }
      }

      // 点击窗口外部关闭：点击在任一窗口或触发按钮内则保持打开，否则全部关闭
      if (t.closest("#panel") || t.closest("#settings") ||
          t.closest("#search-engine-menu") || t.closest("#search-engine-btn") ||
          t.closest("#card-editor") || t.closest("#confirm-dialog")) return;
      // 点击右键菜单内部：只移除菜单
      if (t.closest("#card-menu")) { removeCardMenu(); return; }
      closeAllPopups();
    });

    // 动态表单字段变更：内联编辑引擎 / 卡片
    document.addEventListener("change", e => {
      const el = e.target;
      if (!el || !el.matches) return;
      if (el.matches("[data-action='edit-engine']")) {
        editEngine(Number(el.dataset.index), el.dataset.field, el.value);
      } else if (el.matches("[data-action='edit-card']")) {
        editCardValue(Number(el.dataset.index), el.dataset.field, el.value);
      }
    });

    // 键盘可达性：Enter/Space 触发可聚焦的动态操作项；Escape 关闭原生下拉并复位箭头
    document.addEventListener("keydown", e => {
      if (e.key === "Enter" || e.key === " ") {
        const trigger = e.target.closest("[data-action]");
        if (trigger && ["toggle-engine", "toggle-card", "collapse", "change-engine"].includes(trigger.dataset.action)) {
          e.preventDefault();
          trigger.click();
        }
      }
    });

    // 拖拽排序 + 卡片右键菜单：事件委托，只绑定一次（列表重建无需重新绑定）
    const commitSites = () => { saveState(); renderSites(); };
    const commitEngines = () => { markEngineDirty(); saveState(); renderEngines(); };
    attachDelegatedDragSort($("sites"), () => config.sites, commitSites);
    attachDelegatedDragSort($("engine-list"), () => engines, commitEngines);
    attachDelegatedDragSort($("editor"), () => config.sites, commitSites);
    $("sites").addEventListener("contextmenu", e => {
      const link = e.target.closest("a.shortcut");
      if (!link) return;
      e.preventDefault();
      showCardMenu(Number(link.dataset.index), e.clientX, e.clientY);
    });

    // 设置面板开关 + 同步各控件当前值
    $("settings").onclick = () => {
      const panel = $("panel");
      const opening = panel.style.display !== "block";
      panel.style.display = opening ? "block" : "none";
      $("settings").setAttribute("aria-expanded", String(opening));
      if (opening) {
        $("theme-mode").value = theme;
        $("lang-mode").value = lang;
        $("card-columns").value = config.layout.columns || 6;
        $("hide-cards").checked = !!config.layout.hide;
        syncColorInputs();
        syncColorPanel();
        renderEngineList();
        renderEditor();
      } else {
        applyColors(); // 关闭面板时撤销未保存的颜色预览
      }
    };

    // 添加搜索引擎表单
    $("save-engine").onclick = addEngine;
    $("show-engine-form").onclick = () => {
      const form = $("engine-form");
      const open = form.classList.toggle("show");
      $("show-engine-form").setAttribute("aria-expanded", String(open));
    };
    $("cancel-engine").onclick = () => {
      ["engine-name", "engine-url", "engine-keyword"].forEach(id => $(id).value = "");
      $("engine-form").classList.remove("show");
      $("show-engine-form").setAttribute("aria-expanded", "false");
    };

    // 原生下拉箭头随展开/关闭翻转（事件委托到 document，覆盖动态渲染的卡片图标选择框）：
    // focusin/mousedown = 展开（箭头朝上）；change（选中）/focusout（失焦）/Escape = 关闭（箭头朝下）
    const ARROW_SELECT = "#panel select, #card-editor select";
    const isArrowSelect = e => !!(e.target && e.target.matches && e.target.matches(ARROW_SELECT));
    const setArrowOpen = (el, open) => {
      el.classList.toggle("open", open);
      el.setAttribute("aria-expanded", String(open));
    };
    document.addEventListener("focusin", e => { if (isArrowSelect(e)) setArrowOpen(e.target, true); });
    document.addEventListener("mousedown", e => { if (isArrowSelect(e)) setArrowOpen(e.target, true); });
    document.addEventListener("change", e => { if (isArrowSelect(e)) setArrowOpen(e.target, false); });
    document.addEventListener("focusout", e => { if (isArrowSelect(e)) setArrowOpen(e.target, false); });
    document.addEventListener("keydown", e => {
      if (e.key !== "Escape") return;
      if (isArrowSelect(e)) {
        setArrowOpen(e.target, false);
        return;
      }
      // Esc 关闭自定义确认对话框（打开时）
      const dialog = $("confirm-dialog");
      if (dialog && !dialog.hidden) hideConfirm();
    });

    // 搜索引擎下拉切换（菜单未打开时无需重绘）
    $("engine").addEventListener("change", e => {
      setEngineIndex(Number(e.target.value));
      syncEngineSelect();
      refreshSearchMenu();
    });

    // 搜索框引擎切换按钮：打开前先渲染并翻转箭头，保证内容与状态同步
    $("search-engine-btn").onclick = () => {
      const menu = $("search-engine-menu");
      setSearchMenuOpen(!menu.classList.contains("open"));
    };

    // 卡片编辑器
    $("save-card").onclick = saveCard;
    $("cancel-card").onclick = closeCardEditor;

    // 添加网站表单
    $("save-site").onclick = addSite;
    $("show-site-form").onclick = () => {
      const form = $("site-form");
      const open = form.classList.toggle("show");
      $("show-site-form").setAttribute("aria-expanded", String(open));
    };
    $("cancel-site").onclick = () => {
      ["site-name", "site-url"].forEach(id => $(id).value = "");
      $("site-form").classList.remove("show");
      $("show-site-form").setAttribute("aria-expanded", "false");
    };

    // 数据导入导出
    $("export-data").onclick = exportData;
    $("import-data").addEventListener("change", function () {
      if (this.files[0]) {
        importData(this.files[0]);
        this.value = ""; // 允许连续导入同一个文件
      }
    });

    // 布局设置
    $("card-columns").addEventListener("change", updateLayout);
    $("hide-cards").addEventListener("change", updateLayout);

    // 主题切换：选"自定义配色"时显示配色配置面板，其余模式隐藏；
    // 配色仅在 custom 模式应用（见 applyColors）
    $("theme-mode").addEventListener("change", function () {
      theme = this.value;
      saveState();
      applyTheme();
      applyColors();
      syncColorPanel();
    });

    bindColorEvents();

    // 语言切换（立即重渲染）
    $("lang-mode").addEventListener("change", function () {
      lang = this.value;
      saveState();
      applyI18n();
      renderEngines();
      renderSites();
    });

    bindSearchEvents();
    bindImageFallbackEvents();
  }
  // ============================================================
  // boot —— 启动
  // ============================================================
  // 读取 config.json；任何失败（404/网络/JSON 错误）都回退空对象，由 normalizeState 补默认值
  async function fetchConfig() {
    try {
      const res = await fetch("config.json");
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } catch (e) { return {}; }
  }

  async function load() {
    rebuildEngineIndex(); // 先用默认引擎建立索引，避免 fetch 完成前关键词搜索失效
    bindEvents();
    // 统一读取：单 key 优先，旧散落 key 自动迁移；损坏 → config.json → 空配置
    applyState(normalizeState(loadState() || await fetchConfig()));
    saveState();  // 首次访问或迁移后落盘
    applyI18n();  // 需在 applyState 之后：语言取自已加载的状态
    applyTheme(); // 需在 applyState 之后：主题取自已加载的状态
    applyColors();// 自定义配色取自已加载的状态
    syncColorPanel(); // 主题为 custom 时显示配色配置面板
    renderEngines();
    renderSites();
  }

  // 不向 window 暴露任何函数：所有动态控件均通过事件委托处理，避免全局命名冲突
  load();
})();
