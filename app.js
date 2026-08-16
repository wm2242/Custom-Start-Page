// ============================================================
// 自定义起始页 (Custom Start Page)
// 纯前端：搜索引擎 + 导航卡片 + 主题 + 中英双语
// 数据存储：localStorage（homepage/engines/engineIndex/theme/lang）
// ============================================================

// ---------- 全局状态 ----------
let config;                    // 站点配置（含 sites/layout/search）
let engines = [                // 搜索引擎列表（可被 localStorage 覆盖）
  { name: "Google",     url: "https://www.google.com/search?q=", keyword: "g" },
  { name: "Bing",       url: "https://www.bing.com/search?q=",   keyword: "b" },
  { name: "DuckDuckGo", url: "https://duckduckgo.com/?q=",       keyword: "ddg" },
  { name: "百度",        url: "https://www.baidu.com/s?wd=",      keyword: "bd" },
  { name: "GitHub",     url: "https://github.com/search?q=",     keyword: "gh" }
];
let editIndex = -1;            // 正在编辑的卡片索引（-1 = 新增模式）
let layout = { columns: 6, hide: false };  // 卡片布局默认值
let lang = localStorage.getItem("lang") || "system";  // 语言偏好：system/zh/en

// ---------- 国际化字典 ----------
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

// ---------- 国际化工具 ----------
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

// ---------- 安全工具 ----------
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

// ---------- 持久化 ----------
function save()        { localStorage.setItem("homepage", JSON.stringify(config)); }
function saveEngines() { localStorage.setItem("engines", JSON.stringify(engines)); }

// ---------- 主题 ----------
// 应用主题：dark / light / system（跟随系统 prefers-color-scheme）
function applyTheme() {
  const mode = localStorage.getItem("theme") || "system";
  document.body.classList.remove("dark");
  if (mode === "dark" ||
      (mode === "system" && window.matchMedia("(prefers-color-scheme:dark)").matches)) {
    document.body.classList.add("dark");
  }
}

// ---------- 初始化 ----------
async function load() {
  applyI18n();
  applyTheme();
  const saved = localStorage.getItem("homepage");
  config = saved ? JSON.parse(saved) : await fetch("config.json").then(r => r.json());
  if (!config.layout) config.layout = { ...layout };
  const se = localStorage.getItem("engines");
  if (se) engines = JSON.parse(se);
  renderEngines();
  render();
}

// ---------- 图标 ----------
// 站点图标三级回退：favicon.ico → favicon.svg → Google favicon → 占位地球
function faviconFallback(img, host) {
  if (!img.dataset.svg) { img.dataset.svg = "1"; img.src = "https://" + host + "/favicon.svg"; return; }
  if (!img.dataset.google) { img.dataset.google = "1"; img.src = "https://www.google.com/s2/favicons?domain=" + host + "&sz=64"; return; }
  img.onerror = null;
  img.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%23ccc'/%3E%3Ctext x='32' y='42' text-anchor='middle' font-size='32'%3E🌐%3C/text%3E%3C/svg%3E";
}

// ---------- 搜索引擎：渲染 ----------
function renderEngines() {
  const select = document.getElementById("engine");
  select.innerHTML = "";
  engines.forEach((e, i) => {
    select.innerHTML += `<option value="${i}">${escapeHtml(e.name)}</option>`;
  });
  let index = Number(localStorage.getItem("engineIndex") || 0);
  if (index >= engines.length) index = 0;
  select.value = index;
  config.search = engines[index].url;
  save();
  renderEngineList();
  renderSearchEngineMenu();
}

// 设置面板：搜索引擎管理列表（可拖拽排序、内联编辑、删除）
function renderEngineList() {
  const box = document.getElementById("engine-list");
  box.innerHTML = "";
  engines.forEach((e, i) => {
    box.innerHTML += `
<div class="engine-sort-item" draggable="true" data-index="${i}">
  <div class="engine-title">
    <span>${i + 1}. ${escapeHtml(e.name)}</span>
    <span onclick="toggleEngineDetail(${i})">⌄</span>
  </div>
  <div class="engine-detail" id="engine-detail-${i}">
    <input value="${escapeHtml(e.name)}" onchange="editEngine(${i},'name',this.value)">
    <input value="${escapeHtml(e.url)}" onchange="editEngine(${i},'url',this.value)">
    <input value="${escapeHtml(e.keyword || '')}" placeholder="${escapeHtml(t('keyword'))}" onchange="editEngine(${i},'keyword',this.value)">
    <button onclick="deleteEngine(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`;
  });
  // 拖拽排序
  box.querySelectorAll(".engine-sort-item").forEach(item => {
    item.ondragstart = e => e.dataTransfer.setData("index", item.dataset.index);
    item.ondragover = e => e.preventDefault();
    item.ondrop = e => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("index"));
      const to = Number(item.dataset.index);
      if (from === to) return;
      const moved = engines.splice(from, 1)[0];
      engines.splice(to, 0, moved);
      saveEngines();
      renderEngines();
    };
  });
}

// 展开/收起单个引擎的编辑区
function toggleEngineDetail(i) {
  const box = document.getElementById("engine-detail-" + i);
  if (!box) return;
  box.classList.toggle("open");
  const arrow = box.previousElementSibling.querySelector("span:last-child");
  arrow.textContent = box.classList.contains("open") ? "⌃" : "⌄";
}

// 编辑引擎字段（name/url/keyword）
function editEngine(i, key, value) {
  engines[i][key] = value.trim();
  saveEngines();
  renderEngines();
}

// 删除引擎（至少保留一个）
function deleteEngine(i) {
  if (engines.length <= 1) { alert(t("at_least_one")); return; }
  engines.splice(i, 1);
  saveEngines();
  if (Number(localStorage.getItem("engineIndex") || 0) >= engines.length) {
    localStorage.setItem("engineIndex", 0);
  }
  renderEngines();
}

// 搜索框旁的引擎快捷切换菜单
function renderSearchEngineMenu() {
  const menu = document.getElementById("search-engine-menu");
  if (!menu) return;
  menu.innerHTML = "";
  const index = Number(localStorage.getItem("engineIndex") || 0);
  const list = [engines[index], ...engines.filter((e, i) => i !== index)];
  list.forEach(e => {
    const i = engines.indexOf(e);
    menu.innerHTML += `<div class="search-engine-item" onclick="changeEngine(${i})">${escapeHtml(e.name)}</div>`;
  });
}

// 切换当前搜索引擎
function changeEngine(i) {
  localStorage.setItem("engineIndex", i);
  config.search = engines[i].url;
  save();
  document.getElementById("engine").value = i;
  renderSearchEngineMenu();
}

// 检查快捷关键词是否重复（排除当前编辑项）
function keywordUnique(k) {
  k = (k || "").trim().toLowerCase();
  if (!k) return true;
  return !engines.some((e, i) => i !== editIndex && (e.keyword || "").trim().toLowerCase() === k);
}

// 添加新搜索引擎（表单提交）
function addEngine() {
  const nameEl = document.getElementById("engine-name");
  const urlEl = document.getElementById("engine-url");
  const keyEl = document.getElementById("engine-keyword");
  const keyword = keyEl.value.trim().toLowerCase();
  if (!nameEl.value.trim() || !urlEl.value.trim()) return;
  if (!keywordUnique(keyword)) { alert(t("keyword_dup")); return; }
  engines.push({ name: nameEl.value.trim(), url: urlEl.value.trim(), keyword });
  saveEngines();
  renderEngines();
  nameEl.value = ""; urlEl.value = ""; keyEl.value = "";
  document.getElementById("engine-form").classList.remove("show");
}

// 添加新网站（表单提交）
function addSite() {
  const nameEl = document.getElementById("site-name");
  const urlEl = document.getElementById("site-url");
  if (!urlEl.value.trim()) return;
  const data = {
    name: nameEl.value.trim() || urlEl.value.trim(),
    url: safeUrl(urlEl.value.trim())
  };
  if (data.url === "#") return; // 非法 URL 拒绝保存
  config.sites.push(data);
  save();
  render();
  nameEl.value = "";
  urlEl.value = "";
  document.getElementById("site-form").classList.remove("show");
}

// ---------- 导航卡片：渲染 ----------
function render() {
  const box = document.getElementById("sites");
  box.innerHTML = "";
  box.style.setProperty("--columns", config.layout.columns || 6);
  box.style.display = config.layout.hide ? "none" : "grid";
  if (config.layout.hide) { renderEditor(); return; }

  config.sites.forEach((site, i) => {
    let host;
    try { host = new URL(site.url).hostname; } catch { return; } // 跳过非法 URL
    const link = document.createElement("a");
    link.className = "shortcut";
    link.href = safeUrl(site.url);
    link.target = "_blank";
    link.rel = "noopener";
    link.draggable = true;

    // 按图标类型生成图标 HTML
    let icon = "";
    if (site.iconType === "emoji") {
      icon = `<span>${escapeHtml(site.icon || "🌐")}</span>`;
    } else if (site.iconType === "url") {
      icon = `<img src="${escapeHtml(site.icon)}">`;
    } else {
      icon = `<img src="https://${escapeHtml(host)}/favicon.ico" onerror="faviconFallback(this,'${escapeHtml(host)}')">`;
    }
    link.innerHTML = `
<div class="shortcut-icon">${icon}</div>
<div class="shortcut-title">${escapeHtml(site.name)}</div>`;

    // 拖拽排序
    link.addEventListener("dragstart", e => { e.dataTransfer.setData("index", i); link.classList.add("dragging"); });
    link.addEventListener("dragend", () => link.classList.remove("dragging"));
    link.addEventListener("dragover", e => e.preventDefault());
    link.addEventListener("drop", e => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("index"));
      if (from === i) return;
      const moved = config.sites.splice(from, 1)[0];
      config.sites.splice(i, 0, moved);
      save();
      render();
    });

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
  addCard.onclick = () => {
    editIndex = -1;
    document.getElementById("card-name").value = "";
    document.getElementById("card-url").value = "";
    document.getElementById("card-icon-type").value = "auto";
    document.getElementById("card-icon").value = "";
    document.getElementById("card-editor").classList.add("open");
  };
  box.appendChild(addCard);
  renderEditor();
}

// 右键弹出卡片操作菜单
function showCardMenu(index, x, y) {
  const old = document.getElementById("card-menu");
  if (old) old.remove();
  const menu = document.createElement("div");
  menu.id = "card-menu";
  menu.innerHTML = `
<div onclick="editCard(${index})">${escapeHtml(t('edit_card'))}</div>
<div onclick="removeCard(${index})">${escapeHtml(t('delete_card'))}</div>
<div onclick="this.parentNode.remove()">${escapeHtml(t('cancel'))}</div>`;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  document.body.appendChild(menu);
}

// 打开卡片编辑器（填充现有数据）
function editCard(i) {
  editIndex = i;
  const card = config.sites[i];
  document.getElementById("card-name").value = card.name || "";
  document.getElementById("card-url").value = card.url || "";
  document.getElementById("card-icon-type").value = card.iconType || "auto";
  document.getElementById("card-icon").value = card.icon || "";
  document.getElementById("card-editor").classList.add("open");
}

// 删除卡片（带确认）
function removeCard(i) {
  if (confirm(t("confirm_delete"))) {
    config.sites.splice(i, 1);
    save();
    render();
  }
}

// 保存卡片（新增或更新）
function saveCard() {
  const nameEl = document.getElementById("card-name");
  const urlEl = document.getElementById("card-url");
  const typeEl = document.getElementById("card-icon-type");
  const iconEl = document.getElementById("card-icon");
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
  save();
  render();
  closeCardEditor();
}

// 关闭卡片编辑器
function closeCardEditor() {
  editIndex = -1;
  document.getElementById("card-editor").classList.remove("open");
}

// 设置面板：导航卡片管理列表（可拖拽排序、内联编辑）
function renderEditor() {
  const box = document.getElementById("editor");
  if (!box) return;
  box.innerHTML = "";
  config.sites.forEach((site, i) => {
    box.innerHTML += `
<div class="card-sort-item" draggable="true" data-index="${i}">
  <div class="card-title">
    <span>${i + 1}. ${escapeHtml(site.name)}</span>
    <span onclick="toggleCardDetail(${i})">⌄</span>
  </div>
  <div class="card-detail" id="card-detail-${i}">
    <input value="${escapeHtml(site.name || "")}" onchange="editCardValue(${i},'name',this.value)">
    <input value="${escapeHtml(site.url || "")}" onchange="editCardValue(${i},'url',this.value)">
    <select onchange="editCardValue(${i},'iconType',this.value)">
      <option value="auto" ${site.iconType === "auto" ? "selected" : ""}>${escapeHtml(t('icon_auto'))}</option>
      <option value="url" ${site.iconType === "url" ? "selected" : ""}>${escapeHtml(t('icon_url'))}</option>
      <option value="emoji" ${site.iconType === "emoji" ? "selected" : ""}>${escapeHtml(t('icon_emoji'))}</option>
    </select>
    <input value="${escapeHtml(site.icon || "")}" onchange="editCardValue(${i},'icon',this.value)">
    <button onclick="removeCard(${i})">${escapeHtml(t('delete'))}</button>
  </div>
</div>`;
  });
  // 拖拽排序
  box.querySelectorAll(".card-sort-item").forEach(item => {
    item.addEventListener("dragstart", e => { e.dataTransfer.setData("index", item.dataset.index); item.classList.add("dragging"); });
    item.addEventListener("dragend", () => item.classList.remove("dragging"));
    item.addEventListener("dragover", e => e.preventDefault());
    item.addEventListener("drop", e => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData("index"));
      const to = Number(item.dataset.index);
      if (from === to) return;
      const moved = config.sites.splice(from, 1)[0];
      config.sites.splice(to, 0, moved);
      save();
      render();
    });
  });
}

// 展开/收起单个卡片编辑区
function toggleCardDetail(i) {
  const box = document.getElementById("card-detail-" + i);
  if (!box) return;
  box.classList.toggle("open");
  const arrow = box.previousElementSibling.querySelector("span:last-child");
  arrow.textContent = box.classList.contains("open") ? "⌃" : "⌄";
}

// 内联编辑卡片字段（url 字段做协议校验）
function editCardValue(i, key, value) {
  if (key === "url") {
    value = safeUrl(value);
    if (value === "#") return;
  }
  config.sites[i][key] = value;
  save();
  render();
}

// ---------- 数据管理 ----------
// 导出全部配置为 JSON 文件
function exportData() {
  const data = {
    sites: config.sites,
    engines,
    layout: config.layout,
    engineIndex: Number(localStorage.getItem("engineIndex") || 0)
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
      if (data.engineIndex !== undefined) localStorage.setItem("engineIndex", data.engineIndex);
      save();
      saveEngines();
      renderEngines();
      render();
    } catch { alert(t("import_fail")); }
  };
  reader.readAsText(file);
}

// 更新卡片布局（每行数量 / 隐藏）
function updateLayout() {
  const input = document.getElementById("card-columns");
  const hide = document.getElementById("hide-cards");
  const n = Number(input.value);
  if (n >= 2 && n <= 10) config.layout.columns = n;
  config.layout.hide = hide.checked;
  save();
  render();
}

// ---------- 事件绑定 ----------
// 设置面板开关 + 同步各控件当前值
document.getElementById("settings").onclick = () => {
  const panel = document.getElementById("panel");
  panel.style.display = panel.style.display === "block" ? "none" : "block";
  if (panel.style.display === "block") {
    document.getElementById("theme-mode").value = localStorage.getItem("theme") || "system";
    document.getElementById("lang-mode").value = localStorage.getItem("lang") || "system";
    document.getElementById("card-columns").value = config.layout.columns || 6;
    document.getElementById("hide-cards").checked = !!config.layout.hide;
    renderEngineList();
    renderEditor();
  }
};

// 折叠面板（箭头 ⌄/⌃ 切换）
document.querySelectorAll(".collapse-title").forEach(title => {
  title.onclick = () => {
    const box = document.getElementById(title.dataset.target);
    box.classList.toggle("open");
    const arrow = title.querySelector("span:last-of-type");
    if (arrow) arrow.textContent = box.classList.contains("open") ? "⌃" : "⌄";
  };
});

// 添加搜索引擎表单
document.getElementById("save-engine").onclick = addEngine;
document.getElementById("show-engine-form").onclick = () => document.getElementById("engine-form").classList.toggle("show");
document.getElementById("cancel-engine").onclick = () => {
  ["engine-name", "engine-url", "engine-keyword"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("engine-form").classList.remove("show");
};

// 搜索引擎下拉切换
document.getElementById("engine").onchange = function () {
  const i = Number(this.value);
  localStorage.setItem("engineIndex", i);
  config.search = engines[i].url;
  save();
  renderSearchEngineMenu();
};

// 搜索框引擎切换按钮
document.getElementById("search-engine-btn").onclick = () => document.getElementById("search-engine-menu").classList.toggle("open");

// 卡片编辑器
document.getElementById("save-card").onclick = saveCard;
document.getElementById("cancel-card").onclick = closeCardEditor;

// 添加网站表单
document.getElementById("save-site").onclick = addSite;
document.getElementById("show-site-form").onclick = () => document.getElementById("site-form").classList.toggle("show");
document.getElementById("cancel-site").onclick = () => {
  ["site-name", "site-url"].forEach(id => document.getElementById(id).value = "");
  document.getElementById("site-form").classList.remove("show");
};

// 数据导入导出
document.getElementById("export-data").onclick = exportData;
document.getElementById("import-data").onchange = function () {
  if (this.files[0]) importData(this.files[0]);
};

// 布局设置
document.getElementById("card-columns").onchange = updateLayout;
document.getElementById("hide-cards").onchange = updateLayout;

// 主题切换
document.getElementById("theme-mode").onchange = function () {
  localStorage.setItem("theme", this.value);
  applyTheme();
};

// 语言切换（立即重渲染）
document.getElementById("lang-mode").onchange = function () {
  lang = this.value;
  localStorage.setItem("lang", lang);
  applyI18n();
  renderEngines();
  render();
};

// ---------- 搜索提交 ----------
// 支持三种输入：`关键词 内容`（用快捷关键词引擎）、`!内容`（当前引擎）、普通搜索
document.getElementById("search").onsubmit = e => {
  e.preventDefault();
  let query = document.getElementById("query").value.trim();
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
};

// ---------- 启动 ----------
load();
