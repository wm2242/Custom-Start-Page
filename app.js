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
// 全局仅暴露 window.app（供模板内联事件使用），其余均为闭包私有。
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
    u = (u || "").trim();
    if (!u) return "#";
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(u)) u = "https://" + u; // 无协议时补全
    try {
      const p = new URL(u);
      if (p.protocol === "http:" || p.protocol === "https:") return u;
    } catch (e) {}
    return "#";
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
      try { localStorage.setItem(key, value); } catch (e) {}
    },
    getJSON(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch (e) { return null; }
    },
    setJSON(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }
  };

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
      theme_colors: "自定义配色", color_bg: "背景色", color_card: "卡片色", color_text: "文字色",
      color_secondary: "次要文字色", color_border: "边框色", color_reset: "恢复默认",
      card_display: "卡片显示", columns: "每行卡片数量", hide_cards: "隐藏所有卡片",
      data_manage: "数据管理", export_data: "导出数据", import_data: "导入数据",
      search_placeholder: "搜索网页",
      card_name: "名称", card_url: "网址",
      icon_auto: "自动图标", icon_url: "图片地址", icon_emoji: "Emoji", icon_content: "图标内容",
      add_card: "添加卡片", edit_card: "编辑卡片", delete_card: "删除卡片", delete: "删除",
      keyword: "关键词",
      confirm_delete: "确定删除此卡片？", at_least_one: "至少保留一个搜索引擎",
      keyword_dup: "关键词重复", engine_url_invalid: "搜索地址无效，需包含查询参数（如 ?q= 或 %s）",
      import_fail: "导入失败", import_too_large: "备份文件过大（超过 {n} MB）",
      import_version: "备份由更新版本导出，无法导入"
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
      theme_colors: "Custom Colors", color_bg: "Background", color_card: "Card", color_text: "Text",
      color_secondary: "Secondary Text", color_border: "Border", color_reset: "Reset",
      card_display: "Card Display", columns: "Cards per Row", hide_cards: "Hide All Cards",
      data_manage: "Data Management", export_data: "Export Data", import_data: "Import Data",
      search_placeholder: "Search the web",
      card_name: "Name", card_url: "URL",
      icon_auto: "Auto Icon", icon_url: "Image URL", icon_emoji: "Emoji", icon_content: "Icon Content",
      add_card: "Add Card", edit_card: "Edit Card", delete_card: "Delete Card", delete: "Delete",
      keyword: "Keyword",
      confirm_delete: "Delete this card?", at_least_one: "Keep at least one search engine",
      keyword_dup: "Keyword already exists", engine_url_invalid: "Invalid search URL — must contain a query parameter (e.g. ?q= or %s)",
      import_fail: "Import failed", import_too_large: "Backup file too large (over {n} MB)",
      import_version: "Backup exported by a newer version — cannot import"
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

  // 将 data-i18n 标注的静态文本应用翻译（text/title/placeholder）
  function applyI18n() {
    const L = curLang();
    document.documentElement.lang = L === "zh" ? "zh-CN" : "en";
    document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-title]").forEach(el => { el.title = t(el.dataset.i18nTitle); });
    document.querySelectorAll("[data-i18n-placeholder]").forEach(el => { el.placeholder = t(el.dataset.i18nPlaceholder); });
  }

  // ============================================================
  // state —— 应用状态（闭包私有，不挂全局）
  // ============================================================
  // 全部持久化数据统一收口在 saveState()/loadState()（单一 key: homepage），
  // 避免分散存储导致导出/导入遗漏（参考建议 6.1）；内存中按职责拆分子对象。
  const DEFAULT_ENGINES = [ // 默认搜索引擎列表
    { name: "Google",     url: "https://www.google.com/search?q=", keyword: "g" },
    { name: "Bing",       url: "https://www.bing.com/search?q=",   keyword: "b" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=",       keyword: "ddg" },
    { name: "百度",        url: "https://www.baidu.com/s?wd=",      keyword: "bd" },
    { name: "GitHub",     url: "https://github.com/search?q=",     keyword: "gh" }
  ];
  const defaultLayout = { columns: 6, hide: false };  // 卡片布局默认值

  let config = { sites: [], layout: Object.assign({}, defaultLayout) }; // 站点与布局
  let engines = DEFAULT_ENGINES.slice();               // 搜索引擎列表
  let engineIndex = 0;                                 // 当前引擎索引
  let theme = "system";                                // 主题：system/light/dark
  let lang = "system";                                 // 语言：system/zh/en
  let colors = null;                                   // 自定义配色：{bg,card,text,secondary,border} 或 null=用主题默认
  let editIndex = -1;                                  // 正在编辑的卡片索引（-1 = 新增模式）

  // ============================================================
  // normalize —— 数据校验与归一化（参考建议 3.1 / 3.2）
  // 任何来源（localStorage / config.json / 导入）的数据都经过这里：
  // 逐字段校验类型、修正为合法值、缺失项补默认值，保证渲染永不因数据结构出错。
  // ============================================================
  const ICON_TYPES = ["auto", "url", "emoji"];
  const COLOR_KEYS = ["bg", "card", "text", "secondary", "border"]; // 可自定义配色的 CSS 变量键

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

  // 站点条目：修正字段类型；URL 非法则整条丢弃
  function normalizeSite(s) {
    if (!s || typeof s !== "object") return null;
    const url = safeUrl(s.url);
    if (url === "#") return null;
    return {
      name: typeof s.name === "string" ? s.name : "",
      url,
      iconType: ICON_TYPES.includes(s.iconType) ? s.iconType : "auto",
      icon: typeof s.icon === "string" ? s.icon : ""
    };
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
    if (Array.isArray(data.sites)) out.sites = data.sites.map(normalizeSite).filter(s => s !== null);
    out.layout = normalizeLayout(data.layout);
    const eng = normalizeEngines(data.engines);
    if (eng) out.engines = eng;
    const idx = Number(data.engineIndex);
    if (Number.isInteger(idx) && idx >= 0 && idx < out.engines.length) out.engineIndex = idx;
    if (["system", "light", "dark"].includes(data.theme)) out.theme = data.theme;
    if (["system", "zh", "en"].includes(data.lang)) out.lang = data.lang;
    out.colors = normalizeColors(data.colors);
    return out;
  }

  // 搜索引擎列表：仅保留结构合法的条目；整体非法返回 null（沿用默认列表）
  function normalizeEngines(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    list.forEach(e => {
      if (e && typeof e === "object" &&
          typeof e.name === "string" && e.name.trim() &&
          typeof e.url === "string") {
        out.push({
          name: e.name,
          url: e.url,
          keyword: typeof e.keyword === "string" ? e.keyword : ""
        });
      }
    });
    return out.length ? out : null;
  }

  // 搜索引擎地址是否可用：必须含 %s / {query} 占位符，或已是带查询参数的 URL
  // （防止拼出 "https://example.com关键字" 这类无效搜索链接，参考建议 3.4）
  function isValidEngineUrl(u) {
    const url = safeUrl(u);
    if (url === "#") return false;
    return url.includes("%s") || url.includes("{query}") || (url.includes("?") && url.includes("="));
  }

  // 构造搜索链接：优先替换 %s / {query} 占位符；否则按“URL 已以查询参数结尾”直接追加
  function buildSearchUrl(base, query) {
    const url = safeUrl(base);
    if (url === "#") return "#";
    const q = encodeURIComponent(query);
    if (url.includes("%s")) return url.replace(/%s/g, q);
    if (url.includes("{query}")) return url.replace(/\{query\}/g, q);
    return url + q;
  }

  // ============================================================
  // persist —— 持久化（统一单一 key，参考建议 6.1）
  // 全部数据（站点/布局/引擎/引擎索引/主题/语言）存进一个 localStorage key，
  // 导出直接序列化它、导入整体恢复，杜绝"分散存储导致遗漏"。
  // ============================================================
  const STATE_VERSION = 2;
  const MAX_IMPORT_SIZE = 5 * 1024 * 1024;  // 导入文件大小上限：5MB（防止解析超大文件卡顿）

  // 把内存状态整体写入单一 key；顺带清理迁移前遗留的旧 key。返回写入的数据对象
  function saveState() {
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
    store.setJSON("homepage", data);
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

  // 应用自定义配色：把颜色写到 body 的内联 CSS 变量（内联优先级最高，
  // 同时覆盖亮/暗两套主题；colors 为 null 时移除，恢复主题默认色）
  function applyColors() {
    const root = document.body;
    if (!colors) {
      COLOR_KEYS.forEach(k => root.style.removeProperty("--" + k));
      return;
    }
    COLOR_KEYS.forEach(k => root.style.setProperty("--" + k, colors[k]));
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
  <div class="engine-title" onclick="app.toggleEngineDetail(${i})">
    <span>${i + 1}. ${escapeHtml(e.name)}</span>
    <span>⌄</span>
  </div>
  <div class="engine-detail" id="engine-detail-${i}">
    <input value="${escapeHtml(e.name)}" onchange="app.editEngine(${i},'name',this.value)">
    <input value="${escapeHtml(e.url)}" onchange="app.editEngine(${i},'url',this.value)">
    <input value="${escapeHtml(e.keyword || "")}" placeholder="${escapeHtml(t('keyword'))}" onchange="app.editEngine(${i},'keyword',this.value)">
    <button onclick="app.deleteEngine(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`).join("");
    // 拖拽排序由 bindEvents 中的事件委托统一处理，这里不再逐项绑定
  }

  // 搜索框旁的引擎快捷切换菜单（当前引擎置顶）
  function renderSearchEngineMenu() {
    const menu = $("search-engine-menu");
    if (!menu) return;
    const idx = getEngineIndex();
    const list = [engines[idx], ...engines.filter((e, i) => i !== idx)];
    menu.innerHTML = list.map(e => {
      const i = engines.indexOf(e);
      return `<div class="search-engine-item" onclick="app.changeEngine(${i})">${escapeHtml(e.name)}</div>`;
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
    if (btn) btn.textContent = open ? "⌃" : "⌄";
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
    const arrow = box.previousElementSibling.querySelector("span:last-child");
    arrow.textContent = open ? "⌃" : "⌄";
  }

  function toggleEngineDetail(i) { toggleDetail("engine-detail", i); }

  // 编辑引擎字段（name/url/keyword）；url 校验搜索地址、keyword 校验重复
  function editEngine(i, key, value) {
    if (key === "url" && !isValidEngineUrl(value)) { alert(t("engine_url_invalid")); return; }
    if (key === "keyword" && !keywordUnique(value, i)) { alert(t("keyword_dup")); return; }
    engines[i][key] = value.trim();
    saveState();
    renderEngines();
  }

  // 删除引擎（至少保留一个）
  function deleteEngine(i) {
    if (engines.length <= 1) { alert(t("at_least_one")); return; }
    engines.splice(i, 1);
    if (getEngineIndex() >= engines.length) engineIndex = 0;
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
    return !engines.some((e, i) => i !== excludeIndex && (e.keyword || "").trim().toLowerCase() === k);
  }

  // 添加新搜索引擎（表单提交）
  function addEngine() {
    const nameEl = $("engine-name");
    const urlEl = $("engine-url");
    const keyEl = $("engine-keyword");
    const keyword = keyEl.value.trim().toLowerCase();
    if (!nameEl.value.trim() || !urlEl.value.trim()) return;
    if (!isValidEngineUrl(urlEl.value)) { alert(t("engine_url_invalid")); return; }
    if (!keywordUnique(keyword, -1)) { alert(t("keyword_dup")); return; }
    engines.push({ name: nameEl.value.trim(), url: urlEl.value.trim(), keyword });
    saveState();
    renderEngines();
    nameEl.value = ""; urlEl.value = ""; keyEl.value = "";
    $("engine-form").classList.remove("show");
  }

  // ============================================================
  // sites —— 导航卡片模块
  // ============================================================

  // 站点图标三级回退：favicon.ico → favicon.svg → Google favicon → 占位地球
  function faviconFallback(img, host) {
    if (!img.dataset.svg) { img.dataset.svg = "1"; img.src = "https://" + host + "/favicon.svg"; return; }
    if (!img.dataset.google) { img.dataset.google = "1"; img.src = "https://www.google.com/s2/favicons?domain=" + host + "&sz=64"; return; }
    img.onerror = null;
    img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23ccc'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-size='32'%3E🌐%3C/text%3E%3C/svg%3E";
  }

  // 按图标类型生成图标 HTML（网格卡片与编辑器共用）
  function siteIcon(site, host) {
    if (site.iconType === "emoji") return `<span>${escapeHtml(site.icon || "🌐")}</span>`;
    if (site.iconType === "url") return `<img src="${escapeHtml(site.icon)}">`;
    return `<img src="https://${escapeHtml(host)}/favicon.ico" onerror="app.faviconFallback(this,'${escapeHtml(host)}')">`;
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
      let host;
      try { host = new URL(site.url).hostname; } catch (e) { return; } // 跳过非法 URL
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
      box.appendChild(link);
      // 拖拽排序与右键菜单由 bindEvents 中的事件委托统一处理，这里不再逐项绑定
    });

    // 末尾的"添加卡片"占位卡片
    const addCard = document.createElement("div");
    addCard.className = "shortcut add-card";
    addCard.innerHTML = `<div class="shortcut-icon add-icon">+</div><div class="shortcut-title">${escapeHtml(t('add_card'))}</div>`;
    addCard.onclick = e => {
      e.stopPropagation(); // 阻止冒泡到全局监听，避免刚打开的编辑器被立即关闭
      editIndex = -1;
      $("card-name").value = "";
      $("card-url").value = "";
      $("card-icon-type").value = "auto";
      $("card-icon").value = "";
      $("card-editor").classList.add("open");
    };
    box.appendChild(addCard);
  }

  // 设置面板：导航卡片管理列表（可拖拽排序、内联编辑）
  function renderEditor() {
    const box = $("editor");
    if (!box || !Array.isArray(config.sites)) return;  // 防御：数据未就绪时安全返回
    box.innerHTML = config.sites.map((site, i) => `
<div class="card-sort-item" draggable="true" data-index="${i}">
  <div class="card-title" onclick="app.toggleCardDetail(${i})">
    <span>${i + 1}. ${escapeHtml(site.name)}</span>
    <span>⌄</span>
  </div>
  <div class="card-detail" id="card-detail-${i}">
    <input value="${escapeHtml(site.name || "")}" onchange="app.editCardValue(${i},'name',this.value)">
    <input value="${escapeHtml(site.url || "")}" onchange="app.editCardValue(${i},'url',this.value)">
    <select onchange="app.editCardValue(${i},'iconType',this.value)">${iconTypeOptions(site.iconType || "auto")}</select>
    <input value="${escapeHtml(site.icon || "")}" onchange="app.editCardValue(${i},'icon',this.value)">
    <button onclick="app.removeCard(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`).join("");
    // 拖拽排序由 bindEvents 中的事件委托统一处理
  }

  // 只更新第 i 张卡片对应的 DOM（网格卡片 + 设置面板列表项），避免整页重绘（参考建议 4.1）
  function syncSiteViews(i) {
    const site = config.sites[i];
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
    const old = $("card-menu");
    if (old) old.remove();
    const menu = document.createElement("div");
    menu.id = "card-menu";
    menu.innerHTML = `
<div onclick="app.editCard(${index})">${escapeHtml(t('edit_card'))}</div>
<div onclick="app.removeCard(${index})">${escapeHtml(t('delete_card'))}</div>
<div onclick="this.parentNode.remove()">${escapeHtml(t('cancel'))}</div>`;
    menu.style.left = x + "px";
    menu.style.top = y + "px";
    document.body.appendChild(menu);
    // 点击任一菜单项后移除菜单
    menu.onclick = () => menu.remove();
  }

  // 打开卡片编辑器（填充现有数据）
  function editCard(i) {
    editIndex = i;
    const card = config.sites[i];
    $("card-name").value = card.name || "";
    $("card-url").value = card.url || "";
    $("card-icon-type").value = card.iconType || "auto";
    $("card-icon").value = card.icon || "";
    $("card-editor").classList.add("open");
  }

  // 删除卡片（带确认）
  function removeCard(i) {
    if (confirm(t("confirm_delete"))) {
      config.sites.splice(i, 1);
      saveState();
      renderSites();
    }
  }

  // 保存卡片（新增或更新）
  function saveCard() {
    const nameEl = $("card-name");
    const urlEl = $("card-url");
    const typeEl = $("card-icon-type");
    const iconEl = $("card-icon");
    if (!urlEl.value.trim()) return;
    const data = {
      name: nameEl.value.trim() || urlEl.value,
      url: safeUrl(urlEl.value.trim()),
      iconType: typeEl.value,
      icon: iconEl.value.trim()
    };
    if (data.url === "#") return; // 非法 URL 拒绝保存
    if (editIndex >= 0) {
      // 编辑既有卡片：就地更新对应 DOM，避免整页重绘（参考建议 4.1）
      config.sites[editIndex] = data;
      saveState();
      syncSiteViews(editIndex);
    } else {
      // 新增卡片
      config.sites.push(data);
      saveState();
      renderSites();
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
    if (key === "url") {
      value = safeUrl(value);
      if (value === "#") return;
    }
    config.sites[i][key] = value;
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
    config.sites.push(data);
    saveState();
    renderSites();
    nameEl.value = "";
    urlEl.value = "";
    $("site-form").classList.remove("show");
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
    a.href = URL.createObjectURL(blob);
    a.download = "homepage-backup-" + timestamp() + ".json";
    a.click();
  }

  // 从 JSON 文件导入配置（渲染时已有 esc/safeUrl 防护；结构经 normalize 校验）
  // 导入前先做两道防线：文件大小上限 + 备份版本号校验
  function importData(file) {
    if (file.size > MAX_IMPORT_SIZE) {
      alert(t("import_too_large").replace("{n}", String(MAX_IMPORT_SIZE / 1024 / 1024)));
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        // 版本校验：更高版本导出的备份结构未知，拒绝导入（缺失/旧版本则照常归一化）
        const v = data && data.version;
        if (typeof v === "number" && v > STATE_VERSION) {
          alert(t("import_version"));
          return;
        }
        applyState(normalizeState(data));  // 站点/布局/引擎/索引/主题/语言整体归一化导入
        saveState();
        renderEngines();
        renderSites();
      } catch (e) { alert(t("import_fail")); }
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
    setSearchMenuOpen(false); // 关闭引擎菜单并复位按钮箭头
    const cardEditor = $("card-editor");
    if (cardEditor) cardEditor.classList.remove("open");
    const cardMenu = $("card-menu");
    if (cardMenu) cardMenu.remove();
  }

  function bindEvents() {
    // 点击窗口外部关闭：点击在任一窗口或触发按钮内则保持打开，否则全部关闭
    document.addEventListener("click", e => {
      const t = e.target;
      if (t.closest("#panel") || t.closest("#settings") ||
          t.closest("#search-engine-menu") || t.closest("#search-engine-btn") ||
          t.closest("#card-editor")) return;
      // 点击右键菜单内部：只移除菜单，不影响菜单项已触发的操作（如打开编辑器）
      if (t.closest("#card-menu")) {
        const m = $("card-menu");
        if (m) m.remove();
        return;
      }
      closeAllPopups();
    });

    // 拖拽排序 + 卡片右键菜单：事件委托，只绑定一次（列表重建无需重新绑定）
    const commitSites = () => { saveState(); renderSites(); };
    const commitEngines = () => { saveState(); renderEngines(); };
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
      if (opening) {
        $("theme-mode").value = theme;
        $("lang-mode").value = lang;
        $("card-columns").value = config.layout.columns || 6;
        $("hide-cards").checked = !!config.layout.hide;
        syncColorInputs();
        renderEngineList();
        renderEditor();
      } else {
        applyColors(); // 关闭面板时撤销未保存的颜色预览
      }
    };

    // 折叠面板（箭头 ⌄/⌃ 切换）
    document.querySelectorAll(".collapse-title").forEach(title => {
      title.onclick = () => {
        const box = $(title.dataset.target);
        box.classList.toggle("open");
        const arrow = title.querySelector("span:last-of-type");
        if (arrow) arrow.textContent = box.classList.contains("open") ? "⌃" : "⌄";
      };
    });

    // 添加搜索引擎表单
    $("save-engine").onclick = addEngine;
    $("show-engine-form").onclick = () => $("engine-form").classList.toggle("show");
    $("cancel-engine").onclick = () => {
      ["engine-name", "engine-url", "engine-keyword"].forEach(id => $(id).value = "");
      $("engine-form").classList.remove("show");
    };

    // 原生下拉箭头随展开/关闭翻转（事件委托到 document，覆盖动态渲染的卡片图标选择框）：
    // focusin/mousedown = 展开（箭头朝上）；change（选中）/focusout（失焦）/Escape = 关闭（箭头朝下）
    const ARROW_SELECT = "#panel select, #card-editor select";
    const isArrowSelect = e => !!(e.target && e.target.matches && e.target.matches(ARROW_SELECT));
    document.addEventListener("focusin", e => { if (isArrowSelect(e)) e.target.classList.add("open"); });
    document.addEventListener("mousedown", e => { if (isArrowSelect(e)) e.target.classList.add("open"); });
    document.addEventListener("change", e => { if (isArrowSelect(e)) e.target.classList.remove("open"); });
    document.addEventListener("focusout", e => { if (isArrowSelect(e)) e.target.classList.remove("open"); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && isArrowSelect(e)) e.target.classList.remove("open");
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
    $("show-site-form").onclick = () => $("site-form").classList.toggle("show");
    $("cancel-site").onclick = () => {
      ["site-name", "site-url"].forEach(id => $(id).value = "");
      $("site-form").classList.remove("show");
    };

    // 数据导入导出
    $("export-data").onclick = exportData;
    $("import-data").addEventListener("change", function () {
      if (this.files[0]) importData(this.files[0]);
    });

    // 布局设置
    $("card-columns").addEventListener("change", updateLayout);
    $("hide-cards").addEventListener("change", updateLayout);

    // 主题切换
    $("theme-mode").addEventListener("change", function () {
      theme = this.value;
      saveState();
      applyTheme();
    });

    // ---------- 自定义配色（按钮展开；保存 / 取消 / 恢复默认）----------
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
    // 面板打开时把颜色控件同步为当前状态（无自定义时取当前生效色）
    function syncColorInputs() {
      COLOR_KEYS.forEach(k => {
        const el = $("color-" + k);
        if (!el) return;
        el.value = colors ? colors[k] :
          getComputedStyle(document.body).getPropertyValue("--" + k).trim() || el.value;
      });
    }
    COLOR_KEYS.forEach(k => {
      const el = $("color-" + k);
      if (!el) return;
      el.addEventListener("input", previewColors);  // 取色过程实时预览
      el.addEventListener("change", previewColors); // 取色器确认后仍先预览
    });
    // 展开/收起配色表单（与"添加网站/添加搜索引擎"交互一致）
    $("show-color-form").onclick = () => $("color-form").classList.toggle("show");
    $("color-save").onclick = () => {
      colors = collectColorValues();  // 保存：提交为正式配色并持久化
      saveState();
      applyColors();
      $("color-form").classList.remove("show");
    };
    $("color-cancel").onclick = () => {
      applyColors();      // 取消：撤销预览，恢复已保存配色（无则用主题默认）
      syncColorInputs();
      $("color-form").classList.remove("show");
    };
    $("color-reset").onclick = () => {
      colors = null;      // 恢复默认：清除配色并持久化
      saveState();
      applyColors();
      syncColorInputs();
      $("color-form").classList.remove("show");
    };

    // 语言切换（立即重渲染）
    $("lang-mode").addEventListener("change", function () {
      lang = this.value;
      saveState();
      applyI18n();
      renderEngines();
      renderSites();
    });

    // ---------- 搜索提交 ----------
    // 支持三种输入：`关键词 内容`（用快捷关键词引擎）、`!内容`（当前引擎）、普通搜索
    $("search").addEventListener("submit", e => {
      e.preventDefault();
      let query = $("query").value.trim();
      if (!query) return;
      const parts = query.split(/\s+/);
      const first = parts[0].toLowerCase();

      // 快捷关键词：`g xxx` → Google 搜索 xxx
      const engine = engines.find(eng => (eng.keyword || "").toLowerCase() === first);
      if (engine) {
        query = parts.slice(1).join(" ");
        if (query) location.href = buildSearchUrl(engine.url, query);
        return;
      }

      // `!xxx` → 强制用当前引擎
      if (query.startsWith("!")) {
        query = query.slice(1).trim();
        location.href = buildSearchUrl(currentSearch(), query);
        return;
      }

      location.href = buildSearchUrl(currentSearch(), query);
    });
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
    bindEvents();
    // 统一读取：单 key 优先，旧散落 key 自动迁移；损坏 → config.json → 空配置
    applyState(normalizeState(loadState() || await fetchConfig()));
    saveState();  // 首次访问或迁移后落盘
    applyI18n();  // 需在 applyState 之后：语言取自已加载的状态
    applyTheme(); // 需在 applyState 之后：主题取自已加载的状态
    applyColors();// 自定义配色取自已加载的状态
    renderEngines();
    renderSites();
  }

  // ============================================================
  // 对外暴露（仅限模板内联事件使用，其余全部闭包私有）
  // ============================================================
  window.app = {
    faviconFallback,
    toggleEngineDetail,
    editEngine,
    deleteEngine,
    changeEngine,
    editCard,
    removeCard,
    editCardValue,
    toggleCardDetail
  };

  load();
})();
