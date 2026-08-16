// ============================================================
// 自定义起始页 (Custom Start Page)
// 纯前端：搜索引擎 + 导航卡片 + 主题 + 中英双语
// 数据存储：localStorage（homepage/engines/engineIndex/theme/lang）
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

  // localStorage 封装：统一读写模式，JSON 自动序列化/反序列化
  const store = {
    get(key, fallback) {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    },
    set(key, value) { localStorage.setItem(key, value); },
    getJSON(key) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : null;
      } catch { return null; }
    },
    setJSON(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
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
      card_display: "卡片显示", columns: "每行卡片数量", hide_cards: "隐藏所有卡片",
      data_manage: "数据管理", export_data: "导出数据", import_data: "导入数据",
      search_placeholder: "搜索网页",
      card_name: "名称", card_url: "网址",
      icon_auto: "自动图标", icon_url: "图片地址", icon_emoji: "Emoji", icon_content: "图标内容",
      add_card: "添加卡片", edit_card: "编辑卡片", delete_card: "删除卡片", delete: "删除",
      keyword: "关键词",
      confirm_delete: "确定删除此卡片？", at_least_one: "至少保留一个搜索引擎",
      keyword_dup: "关键词重复", import_fail: "导入失败"
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
      card_display: "Card Display", columns: "Cards per Row", hide_cards: "Hide All Cards",
      data_manage: "Data Management", export_data: "Export Data", import_data: "Import Data",
      search_placeholder: "Search the web",
      card_name: "Name", card_url: "URL",
      icon_auto: "Auto Icon", icon_url: "Image URL", icon_emoji: "Emoji", icon_content: "Icon Content",
      add_card: "Add Card", edit_card: "Edit Card", delete_card: "Delete Card", delete: "Delete",
      keyword: "Keyword",
      confirm_delete: "Delete this card?", at_least_one: "Keep at least one search engine",
      keyword_dup: "Keyword already exists", import_fail: "Import failed"
    }
  };

  let lang = store.get("lang", "system"); // 语言偏好：system/zh/en

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
  let config;              // 站点配置（含 sites/layout/search）
  let engines = [          // 搜索引擎列表（可被 localStorage 覆盖）
    { name: "Google",     url: "https://www.google.com/search?q=", keyword: "g" },
    { name: "Bing",       url: "https://www.bing.com/search?q=",   keyword: "b" },
    { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=",       keyword: "ddg" },
    { name: "百度",        url: "https://www.baidu.com/s?wd=",      keyword: "bd" },
    { name: "GitHub",     url: "https://github.com/search?q=",     keyword: "gh" }
  ];
  let editIndex = -1;      // 正在编辑的卡片索引（-1 = 新增模式）
  const defaultLayout = { columns: 6, hide: false };  // 卡片布局默认值

  // ============================================================
  // theme —— 主题
  // ============================================================
  // 应用主题：dark / light / system（跟随系统 prefers-color-scheme）
  function applyTheme() {
    const mode = store.get("theme", "system");
    document.body.classList.remove("dark");
    if (mode === "dark" ||
        (mode === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
      document.body.classList.add("dark");
    }
  }

  // ============================================================
  // dnd —— 通用拖拽排序
  // 让 container 内带 [draggable][data-index] 的元素可拖拽换序：
  //   getItems() 返回可变的源数组；drop 成功后调用 commit()（保存 + 重渲染）
  // ============================================================
  function attachDragSort(container, getItems, commit) {
    container.querySelectorAll("[draggable]").forEach(item => {
      const to = Number(item.dataset.index);
      item.addEventListener("dragstart", e => {
        e.dataTransfer.setData("index", String(to));
        item.classList.add("dragging");
      });
      item.addEventListener("dragend", () => item.classList.remove("dragging"));
      item.addEventListener("dragover", e => e.preventDefault());
      item.addEventListener("drop", e => {
        e.preventDefault();
        const from = Number(e.dataTransfer.getData("index"));
        if (Number.isNaN(from) || from === to) return;
        const items = getItems();
        const moved = items.splice(from, 1)[0];
        if (!moved) return;
        items.splice(to, 0, moved);
        commit();
      });
    });
  }

  // ============================================================
  // engines —— 搜索引擎模块
  // ============================================================

  // 读取并校验当前引擎索引（越界回退 0）
  function getEngineIndex() {
    let i = Number(store.get("engineIndex", 0));
    if (Number.isNaN(i) || i < 0 || i >= engines.length) i = 0;
    return i;
  }

  // 保存引擎索引（越界回退 0），返回实际生效的索引
  function setEngineIndex(i) {
    i = Number(i);
    if (Number.isNaN(i) || i < 0 || i >= engines.length) i = 0;
    store.set("engineIndex", i);
    return i;
  }

  // 同步下拉框：重建选项、恢复选中、更新 config.search 并持久化
  function syncEngineSelect() {
    const select = $("engine");
    select.innerHTML = engines
      .map((e, i) => `<option value="${i}">${escapeHtml(e.name)}</option>`)
      .join("");
    const idx = getEngineIndex();
    select.value = idx;
    config.search = engines[idx].url;
    store.setJSON("homepage", config);
  }

  // 设置面板：搜索引擎管理列表（可拖拽排序、内联编辑、删除）
  function renderEngineList() {
    const box = $("engine-list");
    box.innerHTML = engines.map((e, i) => `
<div class="engine-sort-item" draggable="true" data-index="${i}">
  <div class="engine-title">
    <span>${i + 1}. ${escapeHtml(e.name)}</span>
    <span onclick="app.toggleEngineDetail(${i})">⌄</span>
  </div>
  <div class="engine-detail" id="engine-detail-${i}">
    <input value="${escapeHtml(e.name)}" onchange="app.editEngine(${i},'name',this.value)">
    <input value="${escapeHtml(e.url)}" onchange="app.editEngine(${i},'url',this.value)">
    <input value="${escapeHtml(e.keyword || "")}" placeholder="${escapeHtml(t('keyword'))}" onchange="app.editEngine(${i},'keyword',this.value)">
    <button onclick="app.deleteEngine(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`).join("");
    attachDragSort(box, () => engines, () => {
      store.setJSON("engines", engines);
      renderEngines();
    });
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

  // 刷新全部引擎相关视图（下拉框 + 管理列表 + 快捷菜单）
  function renderEngines() {
    syncEngineSelect();
    renderEngineList();
    renderSearchEngineMenu();
  }

  // 展开/收起列表项的编辑区（引擎与卡片共用，prefix 区分元素 id 前缀）
  function toggleDetail(prefix, i) {
    const box = $(prefix + "-" + i);
    if (!box) return;
    box.classList.toggle("open");
    const arrow = box.previousElementSibling.querySelector("span:last-child");
    arrow.textContent = box.classList.contains("open") ? "⌃" : "⌄";
  }

  function toggleEngineDetail(i) { toggleDetail("engine-detail", i); }

  // 编辑引擎字段（name/url/keyword）
  function editEngine(i, key, value) {
    engines[i][key] = value.trim();
    store.setJSON("engines", engines);
    renderEngines();
  }

  // 删除引擎（至少保留一个）
  function deleteEngine(i) {
    if (engines.length <= 1) { alert(t("at_least_one")); return; }
    engines.splice(i, 1);
    store.setJSON("engines", engines);
    if (Number(store.get("engineIndex", 0)) >= engines.length) store.set("engineIndex", 0);
    renderEngines();
  }

  // 切换当前搜索引擎
  function changeEngine(i) {
    const idx = setEngineIndex(i);
    config.search = engines[idx].url;
    store.setJSON("homepage", config);
    $("engine").value = idx;
    renderSearchEngineMenu();
    $("search-engine-menu").classList.remove("open"); // 选择后关闭菜单
  }

  // 检查快捷关键词是否重复（排除当前编辑项）
  function keywordUnique(k) {
    k = (k || "").trim().toLowerCase();
    if (!k) return true;
    return !engines.some((e, i) => i !== editIndex && (e.keyword || "").trim().toLowerCase() === k);
  }

  // 添加新搜索引擎（表单提交）
  function addEngine() {
    const nameEl = $("engine-name");
    const urlEl = $("engine-url");
    const keyEl = $("engine-keyword");
    const keyword = keyEl.value.trim().toLowerCase();
    if (!nameEl.value.trim() || !urlEl.value.trim()) return;
    if (!keywordUnique(keyword)) { alert(t("keyword_dup")); return; }
    engines.push({ name: nameEl.value.trim(), url: urlEl.value.trim(), keyword });
    store.setJSON("engines", engines);
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
    box.innerHTML = "";
    box.style.setProperty("--columns", config.layout.columns || 6);
    const hidden = !!config.layout.hide;
    box.style.display = hidden ? "none" : "grid";
    renderEditor();
    if (hidden) return;

    config.sites.forEach((site, i) => {
      let host;
      try { host = new URL(site.url).hostname; } catch { return; } // 跳过非法 URL
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

      // 右键菜单（编辑/删除）
      link.oncontextmenu = e => {
        e.preventDefault();
        showCardMenu(i, e.clientX, e.clientY);
      };
      box.appendChild(link);
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

    // 卡片网格拖拽排序
    attachDragSort(box, () => config.sites, () => {
      store.setJSON("homepage", config);
      renderSites();
    });
  }

  // 设置面板：导航卡片管理列表（可拖拽排序、内联编辑）
  function renderEditor() {
    const box = $("editor");
    if (!box) return;
    box.innerHTML = config.sites.map((site, i) => `
<div class="card-sort-item" draggable="true" data-index="${i}">
  <div class="card-title">
    <span>${i + 1}. ${escapeHtml(site.name)}</span>
    <span onclick="app.toggleCardDetail(${i})">⌄</span>
  </div>
  <div class="card-detail" id="card-detail-${i}">
    <input value="${escapeHtml(site.name || "")}" onchange="app.editCardValue(${i},'name',this.value)">
    <input value="${escapeHtml(site.url || "")}" onchange="app.editCardValue(${i},'url',this.value)">
    <select onchange="app.editCardValue(${i},'iconType',this.value)">${iconTypeOptions(site.iconType || "auto")}</select>
    <input value="${escapeHtml(site.icon || "")}" onchange="app.editCardValue(${i},'icon',this.value)">
    <button onclick="app.removeCard(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`).join("");
    attachDragSort(box, () => config.sites, () => {
      store.setJSON("homepage", config);
      renderSites();
    });
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
      store.setJSON("homepage", config);
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
    if (editIndex >= 0) config.sites[editIndex] = data;
    else config.sites.push(data);
    store.setJSON("homepage", config);
    renderSites();
    closeCardEditor();
  }

  // 关闭卡片编辑器
  function closeCardEditor() {
    editIndex = -1;
    $("card-editor").classList.remove("open");
  }

  // 展开/收起单个卡片编辑区
  function toggleCardDetail(i) { toggleDetail("card-detail", i); }

  // 内联编辑卡片字段（url 字段做协议校验）
  function editCardValue(i, key, value) {
    if (key === "url") {
      value = safeUrl(value);
      if (value === "#") return;
    }
    config.sites[i][key] = value;
    store.setJSON("homepage", config);
    renderSites();
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
    store.setJSON("homepage", config);
    renderSites();
    nameEl.value = "";
    urlEl.value = "";
    $("site-form").classList.remove("show");
  }

  // ============================================================
  // data —— 数据管理与布局
  // ============================================================

  // 导出全部配置为 JSON 文件
  function exportData() {
    const data = {
      sites: config.sites,
      engines,
      layout: config.layout,
      engineIndex: getEngineIndex()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "homepage-backup.json";
    a.click();
  }

  // 从 JSON 文件导入配置（渲染时已有 esc/safeUrl 防护）
  function importData(file) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const data = JSON.parse(e.target.result);
        if (data.sites) config.sites = data.sites;
        if (data.engines) engines = data.engines;
        if (data.layout) config.layout = data.layout;
        if (data.engineIndex !== undefined) store.set("engineIndex", data.engineIndex);
        store.setJSON("homepage", config);
        store.setJSON("engines", engines);
        renderEngines();
        renderSites();
      } catch { alert(t("import_fail")); }
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
    store.setJSON("homepage", config);
    renderSites();
  }

  // ============================================================
  // events —— 事件绑定
  // ============================================================

  // 关闭所有弹出窗口（面板/引擎菜单/卡片编辑器/右键菜单）
  function closeAllPopups() {
    const panel = $("panel");
    if (panel) panel.style.display = "none";
    const engineMenu = $("search-engine-menu");
    if (engineMenu) engineMenu.classList.remove("open");
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

    // 设置面板开关 + 同步各控件当前值
    $("settings").onclick = () => {
      const panel = $("panel");
      panel.style.display = panel.style.display === "block" ? "none" : "block";
      if (panel.style.display === "block") {
        $("theme-mode").value = store.get("theme", "system");
        $("lang-mode").value = store.get("lang", "system");
        $("card-columns").value = config.layout.columns || 6;
        $("hide-cards").checked = !!config.layout.hide;
        renderEngineList();
        renderEditor();
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

    // 搜索引擎下拉切换
    $("engine").addEventListener("change", e => {
      setEngineIndex(Number(e.target.value));
      syncEngineSelect();
      renderSearchEngineMenu();
    });

    // 搜索框引擎切换按钮
    $("search-engine-btn").onclick = () => $("search-engine-menu").classList.toggle("open");

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
      store.set("theme", this.value);
      applyTheme();
    });

    // 语言切换（立即重渲染）
    $("lang-mode").addEventListener("change", function () {
      lang = this.value;
      store.set("lang", lang);
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
        if (query) location.href = safeUrl(engine.url) + encodeURIComponent(query);
        return;
      }

      // `!xxx` → 强制用当前引擎
      if (query.startsWith("!")) {
        query = query.slice(1).trim();
        location.href = safeUrl(config.search) + encodeURIComponent(query);
        return;
      }

      location.href = safeUrl(config.search) + encodeURIComponent(query);
    });
  }

  // ============================================================
  // boot —— 启动
  // ============================================================
  async function load() {
    bindEvents();
    applyI18n();
    applyTheme();
    config = store.getJSON("homepage") ||
      await fetch("config.json").then(r => r.json())
        .catch(() => ({ sites: [], layout: { ...defaultLayout } })); // 加载失败时用空配置兜底
    if (!config.layout) config.layout = { ...defaultLayout };
    const savedEngines = store.getJSON("engines");
    if (savedEngines) engines = savedEngines;
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
