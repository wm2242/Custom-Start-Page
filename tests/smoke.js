// 冒烟测试：加载 index.html + 重构后的 app.js，验证关键行为与旧版一致
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("jsdom") // 需先执行: cd tests && npm i jsdom;

const ROOT = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const appCode = fs.readFileSync(path.join(ROOT, "app.js"), "utf8");
const configJson = fs.readFileSync(path.join(ROOT, "config.json"), "utf8");

const vc = new VirtualConsole(); // 静默 jsdom 噪音
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  virtualConsole: vc
});
const { window } = dom;
const { document } = window;

// ---- 环境桩 ----
window.fetch = async () => ({ ok: true, json: async () => JSON.parse(configJson) });
window.matchMedia = () => ({ matches: false });
window.alert = () => {};
window.confirm = () => true;
window.navigator.language = "zh-CN";

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("  ✓ " + msg); }
  else { failures++; console.error("  ✗ FAIL: " + msg); }
}

(async () => {
  // ---- 全局污染检查 ----
  const before = new Set(Object.keys(window));
  window.eval(appCode);
  await new Promise(r => setTimeout(r, 100)); // 等 load() 异步完成
  const newGlobals = Object.keys(window).filter(k => !before.has(k));
  assert(newGlobals.length === 1 && newGlobals[0] === "app",
    "全局只新增 window.app（实际新增: " + newGlobals.join(",") + "）");
  assert(typeof window.app.faviconFallback === "function" &&
    ["toggleEngineDetail", "editEngine", "deleteEngine", "changeEngine",
     "editCard", "removeCard", "editCardValue", "toggleCardDetail"]
      .every(k => typeof window.app[k] === "function"),
    "window.app 暴露了 9 个内联事件所需函数");

  // ---- 初始渲染 ----
  const engineSelect = document.getElementById("engine");
  assert(engineSelect.options.length === 5, "引擎下拉框有 5 个选项");
  const sites = document.getElementById("sites");
  assert(sites.querySelectorAll("a.shortcut").length === 4, "网格渲染 4 张卡片");
  assert(sites.querySelectorAll(".add-card").length === 1, "含 1 张添加卡片");
  assert(document.getElementById("editor").querySelectorAll(".card-sort-item").length === 4,
    "设置面板编辑器渲染 4 条");
  assert(document.getElementById("engine-list").querySelectorAll(".engine-sort-item").length === 5,
    "引擎管理列表渲染 5 条");
  const menu = document.getElementById("search-engine-menu");
  assert(menu.querySelectorAll(".search-engine-item").length === 0,
    "菜单未打开时不渲染（懒渲染）");
  document.getElementById("search-engine-btn").click();
  assert(menu.classList.contains("open") &&
    menu.querySelectorAll(".search-engine-item").length === 5,
    "点击按钮打开菜单时渲染 5 项");
  assert(document.getElementById("search-engine-btn").textContent === "⌃",
    "菜单打开后按钮箭头变为 ⌃");
  menu.querySelector(".search-engine-item").click(); // 选择当前引擎
  assert(!menu.classList.contains("open"), "选择引擎后菜单关闭");
  assert(document.getElementById("search-engine-btn").textContent === "⌄",
    "菜单关闭后按钮箭头恢复 ⌄");
  document.getElementById("search-engine-btn").click();
  assert(menu.classList.contains("open"), "再次打开菜单");
  document.body.click(); // 点击页面空白处
  assert(!menu.classList.contains("open") &&
    document.getElementById("search-engine-btn").textContent === "⌄",
    "点击空白处关闭菜单并复位箭头");
  const saved = JSON.parse(window.localStorage.getItem("homepage"));
  assert(saved.search === undefined, "search 不再单独存储（由 engines+engineIndex 派生）");
  assert(saved.engines[saved.engineIndex].url === "https://www.google.com/search?q=",
    "当前搜索地址 = engines[engineIndex].url（单一 key 存储）");

  // ---- 国际化切换 ----
  const langSel = document.getElementById("lang-mode");
  langSel.value = "en";
  langSel.dispatchEvent(new window.Event("change"));
  assert(document.querySelector(".logo").textContent === "Custom Start Page", "切英文后标题变为英文");
  assert(JSON.parse(window.localStorage.getItem("homepage")).lang === "en", "语言已并入统一 key");
  langSel.value = "zh";
  langSel.dispatchEvent(new window.Event("change"));
  assert(document.querySelector(".logo").textContent === "自定义起始页", "切回中文后标题恢复");
  assert(window.localStorage.getItem("lang") === null, "旧 lang key 已清理");

  // ---- 拖拽排序（网格，走事件委托）----
  function dragEvent(type, fromIdx) {
    const ev = new window.Event(type, { bubbles: true, cancelable: true });
    ev.dataTransfer = {
      _d: fromIdx !== undefined ? { index: String(fromIdx) } : {},
      setData(k, v) { this._d[k] = v; },
      getData(k) { return this._d[k]; }
    };
    return ev;
  }
  const links0 = sites.querySelectorAll("a.shortcut");
  assert(links0[0].textContent.includes("邮箱"), "排序前第一张卡片是 邮箱");
  links0[0].dispatchEvent(dragEvent("dragstart", 0));
  links0[2].dispatchEvent(dragEvent("drop", 0));
  // 把第 1 张（邮箱）拖到第 3 位 → 邮箱变第 3，GitHub 升到第 1
  const links1 = sites.querySelectorAll("a.shortcut");
  assert(links1[0].textContent.includes("GitHub") && links1[2].textContent.includes("邮箱"),
    "拖拽后顺序变为 GitHub, YouTube, 邮箱");
  const savedAfter = JSON.parse(window.localStorage.getItem("homepage"));
  assert(savedAfter.sites[0].name === "GitHub" && savedAfter.sites[2].name === "邮箱",
    "排序结果已持久化到 localStorage");

  // ---- 拖拽排序（引擎列表）----
  const engItems = document.querySelectorAll("#engine-list .engine-sort-item");
  engItems[0].dispatchEvent(dragEvent("dragstart", 0));
  engItems[2].dispatchEvent(dragEvent("drop", 0));
  const savedEngines = JSON.parse(window.localStorage.getItem("homepage")).engines;
  assert(savedEngines[0].name === "Bing", "引擎拖拽后 Bing 移到第一位");
  assert(document.querySelector("#engine option").textContent === "Bing", "引擎下拉框顺序同步更新");

  // ---- 内联编辑引擎 ----
  const nameInput = document.querySelector("#engine-list .engine-detail input");
  nameInput.value = "谷歌";
  nameInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(document.querySelector("#engine option").textContent === "谷歌", "内联改名后下拉框同步");

  // ---- 添加网站 ----
  const siteName = document.getElementById("site-name");
  const siteUrl = document.getElementById("site-url");
  siteName.value = "新站点";
  siteUrl.value = "https://example.com";
  document.getElementById("save-site").click();
  assert(sites.querySelectorAll("a.shortcut").length === 5, "添加网站后网格变 5 张");
  assert(JSON.parse(window.localStorage.getItem("homepage")).sites.some(s => s.name === "新站点"),
    "新网站已持久化");

  // ---- XSS 转义 ----
  siteName.value = '<img src=x onerror=alert(1)>';
  siteUrl.value = "https://evil.example.com";
  document.getElementById("save-site").click();
  const htmlStr = sites.innerHTML;
  assert(htmlStr.includes("&lt;img src=x") && !htmlStr.includes('<img src=x onerror'),
    "恶意站点名被 HTML 转义，无 XSS 注入");

  // ---- 删除卡片（confirm 打桩为 true）----
  const beforeCount = sites.querySelectorAll("a.shortcut").length;
  const card = document.querySelectorAll("a.shortcut")[0];
  card.dispatchEvent(new window.Event("contextmenu", { bubbles: true, cancelable: true }));
  const menuEl = document.getElementById("card-menu");
  assert(menuEl && menuEl.querySelectorAll("div").length === 3, "右键菜单弹出 3 项");
  menuEl.querySelectorAll("div")[1].click(); // 删除
  assert(sites.querySelectorAll("a.shortcut").length === beforeCount - 1, "右键删除卡片生效");

  // ---- 卡片编辑器保存 ----
  const gridLink = sites.querySelector("a.shortcut");
  gridLink.dispatchEvent(new window.Event("contextmenu", { bubbles: true, cancelable: true }));
  document.getElementById("card-menu").querySelectorAll("div")[0].click(); // 编辑
  assert(document.getElementById("card-editor").classList.contains("open"), "卡片编辑器打开");
  document.getElementById("card-name").value = "改名卡片";
  document.getElementById("card-url").value = "https://renamed.example.com";
  document.getElementById("save-card").click();
  const s = JSON.parse(window.localStorage.getItem("homepage"));
  assert(s.sites.some(x => x.name === "改名卡片"), "卡片编辑保存成功");

  // ---- 设置面板 ----
  document.getElementById("settings").click();
  assert(document.getElementById("panel").style.display === "block", "设置面板打开");
  assert(document.getElementById("card-columns").value === "6", "面板同步列数控件");

  // ---- 4.1 就地更新：内联编辑卡片字段只更新对应 DOM，不整页重绘 ----
  const editNameInput = document.querySelector("#card-detail-0 input");
  editNameInput.value = "就地改名";
  editNameInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(document.querySelector('#sites a.shortcut[data-index="0"] .shortcut-title').textContent === "就地改名",
    "内联编辑名称后网格卡片就地更新");
  assert(JSON.parse(window.localStorage.getItem("homepage")).sites[0].name === "就地改名",
    "就地更新已持久化");
  const editUrlInput = document.querySelectorAll("#card-detail-0 input")[1];
  editUrlInput.value = "https://inplace.example.com";
  editUrlInput.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(document.querySelector('#sites a.shortcut[data-index="0"]').href === "https://inplace.example.com/",
    "内联编辑 URL 后网格卡片链接就地更新");

  // ---- 6.1 主题并入统一存储 ----
  const themeSel = document.getElementById("theme-mode");
  themeSel.value = "dark";
  themeSel.dispatchEvent(new window.Event("change"));
  const unif = JSON.parse(window.localStorage.getItem("homepage"));
  assert(unif.theme === "dark", "主题切换写入统一 key");
  assert(window.localStorage.getItem("theme") === null, "旧 theme key 已清理");
  assert(document.body.classList.contains("dark"), "暗色主题已生效");
  themeSel.value = "system";
  themeSel.dispatchEvent(new window.Event("change"));

  // ---- 12.x 原生下拉箭头随展开/关闭翻转（open 类切换，事件委托）----
  themeSel.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  assert(themeSel.classList.contains("open"), "获得焦点（下拉展开）时箭头朝上");
  themeSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(!themeSel.classList.contains("open"), "选择选项（下拉关闭）后箭头恢复朝下");
  themeSel.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  themeSel.dispatchEvent(new window.Event("mousedown", { bubbles: true }));
  assert(themeSel.classList.contains("open"), "再次点击展开时箭头朝上");
  themeSel.dispatchEvent(new window.Event("focusout", { bubbles: true }));
  assert(!themeSel.classList.contains("open"), "点击别处（失焦）后箭头恢复朝下");
  themeSel.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  themeSel.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(!themeSel.classList.contains("open"), "按 Esc 关闭后箭头恢复朝下");

  // ---- 12.x 动态渲染的卡片图标选择框同样响应展开/关闭 ----
  const iconSel = document.querySelector("#card-detail-0 select");
  assert(iconSel !== null, "卡片详情内的图标选择框已渲染");
  iconSel.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  assert(iconSel.classList.contains("open"), "图标选择框展开时箭头朝上");
  iconSel.dispatchEvent(new window.Event("change", { bubbles: true }));
  assert(!iconSel.classList.contains("open"), "图标选择框选中后箭头恢复朝下");
  iconSel.dispatchEvent(new window.Event("focusin", { bubbles: true }));
  iconSel.dispatchEvent(new window.Event("focusout", { bubbles: true }));
  assert(!iconSel.classList.contains("open"), "图标选择框失焦后箭头恢复朝下");

  // ================= 健壮性用例（参考建议 3.1–3.4） =================

  // ---- 3.4 添加无效搜索地址被拒绝 ----
  let lastAlert = null;
  window.alert = m => { lastAlert = m; };
  document.getElementById("engine-name").value = "坏引擎";
  document.getElementById("engine-url").value = "https://example.com"; // 无查询参数
  document.getElementById("save-engine").click();
  assert(lastAlert !== null, "无查询参数的搜索地址被拒绝并提示");
  assert(JSON.parse(window.localStorage.getItem("homepage")).engines.length === 5, "拒绝后引擎列表未变化");
  window.alert = () => {};

  // ---- 3.2 导入结构损坏的数据被归一化 ----
  const importInput = document.getElementById("import-data");
  const badFile = new window.File([JSON.stringify({
    sites: "not-an-array",                                   // 类型错误
    layout: { columns: "abc", hide: true },                  // 非法列数
    engines: [null, { name: "E1", url: "https://e1.com/search?q=" }], // 含非法条目
    engineIndex: 0
  })], "bad.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [badFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await new Promise(r => setTimeout(r, 100));
  const norm = JSON.parse(window.localStorage.getItem("homepage"));
  assert(Array.isArray(norm.sites) && norm.sites.length === 0, "导入时 sites 非数组 → 归一化为空数组");
  assert(norm.layout.columns === 6 && norm.layout.hide === true, "导入时非法列数 → 回退默认 6，hide 保留");
  const impEngines = JSON.parse(window.localStorage.getItem("homepage")).engines;
  assert(impEngines.length === 1 && impEngines[0].name === "E1", "导入引擎跳过非法条目，只保留合法项");

  // ---- 7.1 导出：文件名带时间戳 + 内容含版本号 ----
  let capturedBlob = null;
  const origCreate = window.URL.createObjectURL;
  window.URL.createObjectURL = b => { capturedBlob = b; return "blob:test"; };
  let capturedAnchor = null;
  const origClick = window.HTMLAnchorElement.prototype.click;
  window.HTMLAnchorElement.prototype.click = function () { capturedAnchor = this; };
  document.getElementById("export-data").click();
  window.URL.createObjectURL = origCreate;
  window.HTMLAnchorElement.prototype.click = origClick;
  assert(capturedAnchor && /^homepage-backup-\d{8}-\d{6}\.json$/.test(capturedAnchor.download),
    "导出文件名带时间戳（homepage-backup-YYYYMMDD-HHMMSS.json）");
  const exported = JSON.parse(await capturedBlob.text());
  assert(exported.version === 2, "导出内容包含格式版本号");
  assert(Array.isArray(exported.sites) && Array.isArray(exported.engines) &&
    exported.layout && exported.theme && exported.lang,
    "导出包含全部数据字段（sites/layout/engines/engineIndex/theme/lang）");

  // ---- 7.2 导入：更新版本的备份被拒绝 ----
  lastAlert = null;
  window.alert = m => { lastAlert = m; };
  const verFile = new window.File([JSON.stringify({ version: 99, sites: [] })],
    "future.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [verFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await new Promise(r => setTimeout(r, 50));
  assert(lastAlert !== null && lastAlert !== "import_version",
    "更高版本备份被拒绝并提示（i18n 已解析）");
  assert(JSON.parse(window.localStorage.getItem("homepage")).version === 2,
    "拒绝后本地数据未变（仍为当前版本）");

  // ---- 7.3 导入：超大文件被拒绝，不解析 ----
  lastAlert = null;
  const bigFile = new window.File([new Array(6 * 1024 * 1024).join("x")],
    "big.json", { type: "application/json" });
  assert(bigFile.size > 5 * 1024 * 1024, "构造 6MB 测试文件");
  Object.defineProperty(importInput, "files", { value: [bigFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await new Promise(r => setTimeout(r, 50));
  assert(lastAlert !== null && lastAlert !== "import_too_large",
    "超大备份文件被拒绝并提示（i18n 已解析）");
  window.alert = () => {};

  // ---- 3.1 localStorage 数据损坏 + config.json 加载失败 → 不崩溃，回退默认 ----
  const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w2 = dom2.window;
  w2.matchMedia = () => ({ matches: false });
  w2.alert = () => {};
  w2.fetch = async () => { throw new Error("404"); };       // config.json 加载失败
  w2.localStorage.setItem("homepage", "{corrupted json");   // 损坏数据
  w2.localStorage.setItem("engines", "not-json");
  w2.eval(appCode);
  await new Promise(r => setTimeout(r, 100));
  assert(w2.document.getElementById("sites").querySelectorAll("a.shortcut").length === 0,
    "损坏数据 + config.json 失败 → 渲染空网格不崩溃");
  assert(w2.document.getElementById("sites").querySelectorAll(".add-card").length === 1,
    "空配置下仍有添加卡片占位");
  assert(w2.document.getElementById("engine").options.length === 5,
    "损坏的 engines → 回退默认 5 个引擎");

  // ---- 3.3 localStorage 被禁用（隐私模式）→ 不崩溃 ----
  const dom3 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w3 = dom3.window;
  w3.matchMedia = () => ({ matches: false });
  w3.alert = () => {};
  w3.fetch = window.fetch;
  Object.defineProperty(w3, "localStorage", { get() { throw new Error("denied"); } });
  let denied = false;
  try { w3.eval(appCode); await new Promise(r => setTimeout(r, 100)); }
  catch { denied = true; }
  assert(!denied, "localStorage 禁用时不抛异常");
  assert(w3.document.getElementById("sites").querySelectorAll("a.shortcut").length === 4,
    "localStorage 禁用时仍从 config.json 渲染 4 张卡片");
  assert(w3.document.getElementById("engine").options.length === 5, "localStorage 禁用时默认引擎可用");

  // ---- 6.1 旧版分散 key 自动迁移为统一 key ----
  const dom4 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w4 = dom4.window;
  w4.matchMedia = () => ({ matches: false });
  w4.alert = () => {};
  w4.fetch = window.fetch;
  w4.navigator.language = "zh-CN"; // 固定系统语言为中文：英文标题只可能来自迁移的 lang=en
  w4.localStorage.setItem("homepage", JSON.stringify({ // 旧格式：无 version，含 search
    search: "https://legacy.example.com/search?q=",
    sites: [{ name: "旧站", url: "https://legacy.example.com", iconType: "auto", icon: "" }],
    layout: { columns: 4, hide: false }
  }));
  w4.localStorage.setItem("engines", JSON.stringify([{ name: "旧引擎", url: "https://legacy.example.com/search?q=", keyword: "l" }]));
  w4.localStorage.setItem("engineIndex", "0");
  w4.localStorage.setItem("theme", "dark");
  w4.localStorage.setItem("lang", "en");
  w4.eval(appCode);
  await new Promise(r => setTimeout(r, 100));
  const migrated = JSON.parse(w4.localStorage.getItem("homepage"));
  assert(migrated.version === 2, "迁移后写入 version:2 的统一结构");
  assert(migrated.sites[0].name === "旧站" && migrated.engines[0].name === "旧引擎",
    "旧 homepage + engines 合并迁移");
  assert(migrated.theme === "dark" && migrated.lang === "en", "旧 theme/lang 已迁移");
  assert(migrated.search === undefined, "旧 search 字段被丢弃（改为派生）");
  assert(w4.localStorage.getItem("engines") === null && w4.localStorage.getItem("theme") === null &&
    w4.localStorage.getItem("lang") === null && w4.localStorage.getItem("engineIndex") === null,
    "迁移后旧 key 全部清理");
  assert(w4.document.body.classList.contains("dark"), "迁移的暗色主题已生效");
  assert(w4.document.querySelector(".logo").textContent === "Custom Start Page", "迁移的英文语言已生效");
  assert(w4.document.getElementById("sites").querySelectorAll("a.shortcut").length === 1,
    "迁移的旧站点已渲染");

  // ---- 8.1 编辑引擎时校验关键词重复 ----
  // ---- 8.2 删除引擎后索引越界自动回退，派生搜索无失效引用 ----
  const dom5 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w5 = dom5.window;
  w5.matchMedia = () => ({ matches: false });
  w5.fetch = window.fetch;
  let alert5 = null;
  w5.alert = m => { alert5 = m; };
  w5.eval(appCode);
  await new Promise(r => setTimeout(r, 100));

  // 8.1 编辑关键词为已有值 → 拒绝；不重复 → 允许
  const kwInputs = w5.document.querySelectorAll("#engine-list .engine-detail input");
  const item1Keyword = kwInputs[1 * 3 + 2]; // 第 2 个引擎（Bing, keyword=b）的关键词输入框
  alert5 = null;
  item1Keyword.value = "g"; // 与第 1 个引擎（Google, keyword=g）重复
  item1Keyword.dispatchEvent(new w5.Event("change", { bubbles: true }));
  assert(alert5 !== null && alert5 !== "keyword_dup", "编辑引擎为重复关键词被拒绝（i18n 已解析）");
  assert(JSON.parse(w5.localStorage.getItem("homepage")).engines[1].keyword === "b",
    "重复关键词未写入");
  alert5 = null;
  item1Keyword.value = "zz";
  item1Keyword.dispatchEvent(new w5.Event("change", { bubbles: true }));
  assert(alert5 === null &&
    JSON.parse(w5.localStorage.getItem("homepage")).engines[1].keyword === "zz",
    "不重复的关键词可正常编辑");

  // 8.2 选中最后一个引擎后删除第一个 → 索引越界自动回退 0，无失效 search 引用
  const engineSel5 = w5.document.getElementById("engine");
  engineSel5.value = "4";
  engineSel5.dispatchEvent(new w5.Event("change"));
  assert(JSON.parse(w5.localStorage.getItem("homepage")).engineIndex === 4, "已选中最后一个引擎");
  w5.document.querySelector("#engine-list .engine-sort-item button").click(); // 删除第 1 个（Google）
  const st5 = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(st5.engines.length === 4, "删除后剩 4 个引擎");
  assert(st5.engineIndex === 0, "索引越界自动回退到 0");
  assert(st5.search === undefined, "无失效的 search 引用（搜索地址由 engines[0] 派生）");
  assert(engineSel5.value === "0", "下拉框同步回退到第 1 个引擎");

  // ---- 9.1 导出包含全部设置（搜索/语言/主题/卡片布局/引擎/站点）----
  w5.document.getElementById("theme-mode").value = "dark";
  w5.document.getElementById("theme-mode").dispatchEvent(new w5.Event("change"));
  w5.document.getElementById("lang-mode").value = "en";
  w5.document.getElementById("lang-mode").dispatchEvent(new w5.Event("change"));
  engineSel5.value = "2";
  engineSel5.dispatchEvent(new w5.Event("change"));
  let blob5 = null;
  const origC5 = w5.URL.createObjectURL;
  w5.URL.createObjectURL = b => { blob5 = b; return "blob:t"; };
  const origClick5 = w5.HTMLAnchorElement.prototype.click;
  w5.HTMLAnchorElement.prototype.click = function () {};
  w5.document.getElementById("export-data").click();
  w5.URL.createObjectURL = origC5;
  w5.HTMLAnchorElement.prototype.click = origClick5;
  const exp5 = JSON.parse(await blob5.text());
  assert(exp5.theme === "dark" && exp5.lang === "en", "导出包含主题与语言设置");
  assert(exp5.engineIndex === 2, "导出包含当前搜索引擎索引（搜索设置）");
  assert(exp5.layout && typeof exp5.layout.columns === "number" &&
    typeof exp5.layout.hide === "boolean", "导出包含卡片布局设置（列数/隐藏）");
  assert(Array.isArray(exp5.engines) && exp5.engines.length === 4, "导出包含引擎管理数据");
  assert(Array.isArray(exp5.sites), "导出包含卡片管理数据");
  assert("colors" in exp5, "导出包含配色字段");

  // ---- 9.2 从输入控件发起拖拽不会触发排序拖拽（不干扰文本选取/编辑）----
  const detailInput = w5.document.querySelector("#engine-list .engine-detail input");
  const dragFromInput = new w5.Event("dragstart", { bubbles: true, cancelable: true });
  dragFromInput.dataTransfer = { setData() {}, getData() { return ""; } };
  detailInput.dispatchEvent(dragFromInput);
  assert(!detailInput.closest(".engine-sort-item").classList.contains("dragging"),
    "从输入框拖拽不触发排序（无 dragging 标记）");
  const dragFromTitle = new w5.Event("dragstart", { bubbles: true, cancelable: true });
  dragFromTitle.dataTransfer = { _d: {}, setData(k, v) { this._d[k] = v; }, getData(k) { return this._d[k]; } };
  const engTitle = w5.document.querySelector(".engine-title");
  engTitle.dispatchEvent(dragFromTitle);
  assert(engTitle.closest(".engine-sort-item").classList.contains("dragging") &&
    dragFromTitle.dataTransfer._d.index !== undefined,
    "从标题栏拖拽正常触发排序");
  engTitle.closest(".engine-sort-item").classList.remove("dragging"); // 清理标记，避免影响后续用例

  // ---- 9.3 点击整行标题即可展开/收起详情 ----
  const detailBox = w5.document.getElementById("engine-detail-0");
  assert(!detailBox.classList.contains("open"), "初始详情为收起状态");
  w5.document.querySelector(".engine-title").click();
  assert(detailBox.classList.contains("open"), "点击标题行展开详情");
  assert(w5.document.querySelector(".engine-title span:last-child").textContent === "⌃",
    "展开后箭头变为 ⌃");
  w5.document.querySelector(".engine-title").click();
  assert(!detailBox.classList.contains("open"), "再次点击标题行收起详情");
  assert(w5.document.querySelector(".engine-title span:last-child").textContent === "⌄",
    "收起后箭头恢复 ⌄");
  const cardDetail = w5.document.getElementById("card-detail-0");
  assert(!cardDetail.classList.contains("open"), "卡片详情初始收起");
  w5.document.querySelector(".card-title").click();
  assert(cardDetail.classList.contains("open"), "点击卡片标题行展开详情");

  // ---- 9.4 编辑模式（详情展开）下该行禁用拖拽 ----
  const sortItem0 = w5.document.querySelector("#engine-list .engine-sort-item");
  assert(sortItem0.draggable === true, "收起状态下该行可拖拽");
  w5.document.querySelector("#engine-list .engine-title").click(); // 展开第 1 项
  assert(sortItem0.draggable === false, "编辑模式（详情展开）下该行禁用拖拽");
  const dragInEdit = new w5.Event("dragstart", { bubbles: true, cancelable: true });
  dragInEdit.dataTransfer = { _d: {}, setData(k, v) { this._d[k] = v; }, getData(k) { return this._d[k]; } };
  sortItem0.dispatchEvent(dragInEdit);
  assert(!sortItem0.classList.contains("dragging") && dragInEdit.dataTransfer._d.index === undefined,
    "编辑模式下拖拽被忽略（不触发排序）");
  w5.document.querySelector("#engine-list .engine-title").click(); // 收起
  assert(sortItem0.draggable === true, "收起后恢复可拖拽");
  const dragAfterClose = new w5.Event("dragstart", { bubbles: true, cancelable: true });
  dragAfterClose.dataTransfer = { _d: {}, setData(k, v) { this._d[k] = v; }, getData(k) { return this._d[k]; } };
  sortItem0.dispatchEvent(dragAfterClose);
  assert(dragAfterClose.dataTransfer._d.index !== undefined, "收起后拖拽排序恢复正常");

  // ---- 14.x 自定义配色（按钮展开表单 + 保存/取消/恢复默认，与添加网站/引擎一致）----
  const colorForm = w5.document.getElementById("color-form");
  assert(!colorForm.classList.contains("show"), "配色表单初始收起");
  w5.document.getElementById("show-color-form").click();
  assert(colorForm.classList.contains("show"), "点击按钮展开配色表单");
  w5.document.getElementById("show-color-form").click();
  assert(!colorForm.classList.contains("show"), "再次点击按钮收起表单");
  w5.document.getElementById("show-color-form").click();
  assert(colorForm.classList.contains("show"), "重新展开配色表单");

  // 调整颜色 → 仅实时预览，不持久化
  w5.document.getElementById("color-bg").value = "#112233";
  w5.document.getElementById("color-card").value = "#445566";
  w5.document.getElementById("color-text").value = "#aabbcc";
  w5.document.getElementById("color-secondary").value = "#ddeeff";
  w5.document.getElementById("color-border").value = "#010203";
  w5.document.getElementById("color-bg").dispatchEvent(new w5.Event("change", { bubbles: true }));
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#112233",
    "调整颜色实时预览（内联变量已更新）");
  assert(JSON.parse(w5.localStorage.getItem("homepage")).colors === null,
    "未点保存前不持久化");

  // 保存 → 持久化 + 表单收起
  w5.document.getElementById("color-save").click();
  const colState = JSON.parse(w5.localStorage.getItem("homepage")).colors;
  assert(colState && colState.bg === "#112233" && colState.card === "#445566" &&
    colState.text === "#aabbcc" && colState.secondary === "#ddeeff" && colState.border === "#010203",
    "保存后 5 个配色持久化到统一存储");
  assert(!colorForm.classList.contains("show"), "保存后表单收起");

  // 再改颜色（预览）→ 取消 → 恢复已保存值 + 表单收起
  w5.document.getElementById("show-color-form").click();
  w5.document.getElementById("color-bg").value = "#fedcba";
  w5.document.getElementById("color-bg").dispatchEvent(new w5.Event("input", { bubbles: true }));
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#fedcba",
    "input 事件实时预览生效");
  w5.document.getElementById("color-cancel").click();
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#112233",
    "取消后撤销预览，恢复已保存配色");
  assert(w5.document.getElementById("color-bg").value === "#112233",
    "取消后颜色控件同步回已保存值");
  assert(!colorForm.classList.contains("show"), "取消后表单收起");

  // 恢复默认：colors 置 null 并移除内联变量 + 表单收起
  w5.document.getElementById("show-color-form").click();
  w5.document.getElementById("color-reset").click();
  const afterReset = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(afterReset.colors === null, "恢复默认后 colors 为 null");
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "",
    "恢复默认后内联变量被移除");
  assert(!colorForm.classList.contains("show"), "恢复默认后表单收起");

  // 导入非法配色 → 归一化为 null
  const badColorFile = new w5.File([JSON.stringify({
    sites: [], colors: { bg: "red", card: "#ffffff", text: "#000000", secondary: "#666666", border: "#cccccc" }
  })], "badcolor.json", { type: "application/json" });
  Object.defineProperty(w5.document.getElementById("import-data"), "files",
    { value: [badColorFile], configurable: true });
  w5.document.getElementById("import-data").dispatchEvent(new w5.Event("change"));
  await new Promise(r => setTimeout(r, 80));
  const afterBadColor = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(afterBadColor.colors === null, "含非法色值的配色数据被归一化为 null");

  console.log(failures === 0 ? "\n全部通过 ✔" : `\n${failures} 项失败 ✘`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("测试脚本异常:", e); process.exit(1); });
