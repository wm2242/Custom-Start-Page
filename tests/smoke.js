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
Object.defineProperty(window.navigator, "language", { value: "zh-CN", configurable: true });

let failures = 0;
function assert(cond, msg) {
  if (cond) { console.log("  ✓ " + msg); }
  else { failures++; console.error("  ✗ FAIL: " + msg); }
}

// jsdom 的 Blob 不一定实现 .text()，用 FileReader 读取以保证测试可移植
function readBlobText(win, blob) {
  return new Promise((resolve, reject) => {
    const reader = new win.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

// 轮询等待条件成立，避免固定 setTimeout 在慢速环境下的时序性失败
function waitFor(cond, desc, timeout = 1500) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    (function poll() {
      let ok = false;
      try { ok = !!cond(); } catch (e) { ok = false; }
      if (ok) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("等待超时: " + desc));
      setTimeout(poll, 20);
    })();
  });
}

function getToastText(win) {
  const el = win.document.getElementById("toast");
  return el ? el.textContent : "";
}

(async () => {
  // ---- 全局污染检查 ----
  const before = new Set(Object.keys(window));
  window.eval(appCode);
  await waitFor(() => document.getElementById("engine").options.length === 5, "初始引擎渲染完成");
  // 排除浏览器/ jsdom 自动暴露的带 id 元素全局引用，只检查真正的应用全局
  const newGlobals = Object.keys(window).filter(k => !before.has(k) && !document.getElementById(k));
  assert(newGlobals.length === 0,
    "不向 window 暴露任何应用全局变量（实际新增: " + newGlobals.join(",") + "）");

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
  assert(menu.querySelector(".search-engine-item.active") &&
    menu.querySelector(".search-engine-item.active").dataset.index === "0",
    "当前搜索引擎在菜单中有明显选中状态");
  assert(document.getElementById("search-engine-btn").textContent === "⌃",
    "菜单打开后按钮箭头变为 ⌃");
  assert(document.getElementById("search-engine-btn").getAttribute("aria-expanded") === "true",
    "菜单打开后 aria-expanded=true");
  menu.querySelector(".search-engine-item").click(); // 选择当前引擎
  assert(!menu.classList.contains("open"), "选择引擎后菜单关闭");
  assert(document.getElementById("search-engine-btn").textContent === "⌄",
    "菜单关闭后按钮箭头恢复 ⌄");
  assert(document.getElementById("search-engine-btn").getAttribute("aria-expanded") === "false",
    "菜单关闭后 aria-expanded=false");
  document.getElementById("search-engine-btn").click();
  assert(menu.classList.contains("open"), "再次打开菜单");
  document.body.click(); // 点击页面空白处
  assert(!menu.classList.contains("open") &&
    document.getElementById("search-engine-btn").textContent === "⌄",
    "点击空白处关闭菜单并复位箭头");
  const saved = JSON.parse(window.localStorage.getItem("homepage"));
  assert(saved.search === undefined, "search 不再单独存储（由 engines+engineIndex 派生）");
  assert(saved.engines[saved.engineIndex].url === "https://www.google.com/search?q=%s",
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

  // ---- 输入上限：新增/编辑时超长字段在保存时即被截断（不等到重载）----
  siteName.value = "x".repeat(300);
  siteUrl.value = "https://example.com";
  document.getElementById("save-site").click();
  const longNameSaved = JSON.parse(window.localStorage.getItem("homepage")).sites;
  assert(longNameSaved[longNameSaved.length - 1].name.length <= 100,
    "新增卡片超长名称保存时被截断（≤100）");

  // ---- 自定义图标协议白名单：非法协议不得进入 <img src> ----
  sites.querySelector(".add-card").click();
  document.getElementById("card-name").value = "图标安全";
  document.getElementById("card-url").value = "https://icons.example.com";
  document.getElementById("card-icon-type").value = "url";
  document.getElementById("card-icon").value = "javascript:alert(1)";
  document.getElementById("save-card").click();
  const iconCard = Array.from(sites.querySelectorAll("a.shortcut"))
    .find(a => a.textContent.includes("图标安全"));
  assert(iconCard && !iconCard.innerHTML.includes("javascript:alert(1)"),
    "非法协议的自定义图标未进入 <img src>");
  const savedIcon = JSON.parse(window.localStorage.getItem("homepage")).sites
    .find(s => s.name === "图标安全");
  assert(savedIcon && savedIcon.iconType === "auto", "非法协议图标保存时回退为 auto 类型");

  // ---- 删除卡片（自定义确认对话框）----
  const beforeCount = sites.querySelectorAll("a.shortcut").length;
  const card = document.querySelectorAll("a.shortcut")[0];
  card.dispatchEvent(new window.Event("contextmenu", { bubbles: true, cancelable: true }));
  const menuEl = document.getElementById("card-menu");
  assert(menuEl && menuEl.querySelectorAll("div").length === 3, "右键菜单弹出 3 项");
  menuEl.querySelectorAll("div")[1].click(); // 删除 → 弹出确认对话框
  assert(!document.getElementById("confirm-dialog").hidden, "删除卡片弹出确认对话框");
  document.getElementById("confirm-ok").click();
  assert(sites.querySelectorAll("a.shortcut").length === beforeCount - 1, "确认后右键删除卡片生效");

  // 确认对话框可用 Esc 关闭（不执行删除）
  const escBefore = sites.querySelectorAll("a.shortcut").length;
  const card2 = sites.querySelector("a.shortcut"); // 重新获取（上一张已被删除）
  card2.dispatchEvent(new window.Event("contextmenu", { bubbles: true, cancelable: true }));
  document.getElementById("card-menu").querySelectorAll("div")[1].click();
  assert(!document.getElementById("confirm-dialog").hidden, "再次弹出确认对话框");
  document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  assert(document.getElementById("confirm-dialog").hidden, "Esc 关闭确认对话框");
  assert(sites.querySelectorAll("a.shortcut").length === escBefore, "Esc 取消后卡片未被删除");

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

  const toastEl = document.getElementById("toast");
  function clearToast() { toastEl.textContent = ""; }
  function currentToast() { return toastEl.textContent; }

  // ---- 3.4 添加无效搜索地址被拒绝 ----
  clearToast();
  document.getElementById("engine-name").value = "坏引擎";
  document.getElementById("engine-url").value = "https://example.com"; // 无查询参数
  document.getElementById("save-engine").click();
  assert(currentToast() === "搜索地址无效，需包含 %s 或 {query} 占位符",
    "无查询参数的搜索地址被拒绝并提示具体文案");
  assert(JSON.parse(window.localStorage.getItem("homepage")).engines.length === 5, "拒绝后引擎列表未变化");

  // 非占位符的查询 URL 同样拒绝（如 ?x=1 无法承载查询词）
  clearToast();
  document.getElementById("engine-url").value = "https://example.com/search?x=1";
  document.getElementById("save-engine").click();
  assert(currentToast() === "搜索地址无效，需包含 %s 或 {query} 占位符",
    "无占位符的查询 URL 被拒绝并提示具体文案");
  assert(JSON.parse(window.localStorage.getItem("homepage")).engines.length === 5, "拒绝后引擎列表仍为 5 个");

  // 裸 ? / & 结尾的 URL 同样拒绝（强制 %s 后不再有拼接边界缺陷）
  clearToast();
  document.getElementById("engine-url").value = "https://example.com/search?";
  document.getElementById("save-engine").click();
  assert(currentToast() === "搜索地址无效，需包含 %s 或 {query} 占位符",
    "裸问号结尾的 URL 被拒绝");
  clearToast();
  document.getElementById("engine-url").value = "https://example.com/search?lang=zh&";
  document.getElementById("save-engine").click();
  assert(currentToast() === "搜索地址无效，需包含 %s 或 {query} 占位符",
    "末尾 & 结尾的 URL 被拒绝");
  assert(JSON.parse(window.localStorage.getItem("homepage")).engines.length === 5,
    "边界 URL 拒绝后引擎列表仍为 5 个");

  // 含占位符的 URL 可通过校验
  clearToast();
  document.getElementById("engine-name").value = "占位引擎";
  document.getElementById("engine-url").value = "https://example.com/search?q=%s";
  document.getElementById("save-engine").click();
  assert(currentToast() === "", "含 %s 占位符的 URL 可通过校验");
  assert(JSON.parse(window.localStorage.getItem("homepage")).engines.length === 6,
    "占位符引擎添加成功");

  // ---- 3.2 导入结构损坏的数据被归一化 ----
  const importInput = document.getElementById("import-data");
  const badFile = new window.File([JSON.stringify({
    sites: "not-an-array",                                   // 类型错误
    layout: { columns: "abc", hide: true },                  // 非法列数
    engines: [null, { name: "E1", url: "https://e1.com/search?q=%s" },
      { name: "bad", url: "javascript:alert(1)" }], // 含非法条目/非法协议
    engineIndex: 0
  })], "bad.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [badFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await waitFor(() => {
    try { return JSON.parse(window.localStorage.getItem("homepage")).sites.length === 0; }
    catch (e) { return false; }
  }, "导入损坏数据完成");
  const norm = JSON.parse(window.localStorage.getItem("homepage"));
  assert(Array.isArray(norm.sites) && norm.sites.length === 0, "导入时 sites 非数组 → 归一化为空数组");
  assert(norm.layout.columns === 6 && norm.layout.hide === true, "导入时非法列数 → 回退默认 6，hide 保留");
  const impEngines = JSON.parse(window.localStorage.getItem("homepage")).engines;
  assert(impEngines.length === 1 && impEngines[0].name === "E1", "导入引擎跳过非法条目，只保留合法项");

  // ---- 3.1b 非字符串 URL 不崩溃 ----
  const numericUrlFile = new window.File([JSON.stringify({
    sites: [{ name: "bad", url: 123 }],
    engines: []
  })], "numeric-url.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [numericUrlFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await waitFor(() => {
    try { return JSON.parse(window.localStorage.getItem("homepage")).sites.length === 0; }
    catch (e) { return false; }
  }, "导入数字 URL 完成");
  assert(JSON.parse(window.localStorage.getItem("homepage")).sites.length === 0,
    "数字 URL 被安全丢弃，不崩溃");

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
  const exported = JSON.parse(await readBlobText(window, capturedBlob));
  assert(exported.version === 2, "导出内容包含格式版本号");
  assert(Array.isArray(exported.sites) && Array.isArray(exported.engines) &&
    exported.layout && exported.theme && exported.lang,
    "导出包含全部数据字段（sites/layout/engines/engineIndex/theme/lang）");

  // ---- 7.2 导入：更新版本的备份被拒绝 ----
  clearToast();
  const verFile = new window.File([JSON.stringify({ version: 99, sites: [] })],
    "future.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [verFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await waitFor(() => currentToast() !== "", "更新版本导入提示出现");
  assert(currentToast() === "备份由更新版本导出，无法导入",
    "更高版本备份被拒绝并提示具体翻译文案");
  assert(JSON.parse(window.localStorage.getItem("homepage")).version === 2,
    "拒绝后本地数据未变（仍为当前版本）");

  // ---- 7.3 导入：超大文件被拒绝，不解析 ----
  clearToast();
  const bigFile = new window.File([new Array(6 * 1024 * 1024).join("x")],
    "big.json", { type: "application/json" });
  assert(bigFile.size > 5 * 1024 * 1024, "构造 6MB 测试文件");
  Object.defineProperty(importInput, "files", { value: [bigFile], configurable: true });
  importInput.dispatchEvent(new window.Event("change"));
  await waitFor(() => currentToast() !== "", "超大文件导入提示出现");
  assert(currentToast() === "备份文件过大（超过 5 MB）",
    "超大备份文件被拒绝并提示具体翻译文案");

  // ---- 输入上限：新增引擎超长名称在保存时即被截断（放在引擎数量断言之后）----
  document.getElementById("engine-name").value = "e".repeat(300);
  document.getElementById("engine-url").value = "https://example.com/search?q=%s";
  document.getElementById("save-engine").click();
  const engSaved = JSON.parse(window.localStorage.getItem("homepage")).engines;
  assert(engSaved.every(e => e.name.length <= 100), "新增引擎超长名称保存时被截断（≤100）");

  // ---- 3.1 localStorage 数据损坏 + config.json 加载失败 → 不崩溃，回退默认 ----
  const dom2 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w2 = dom2.window;
  w2.matchMedia = () => ({ matches: false });
  w2.fetch = async () => { throw new Error("404"); };       // config.json 加载失败
  w2.localStorage.setItem("homepage", "{corrupted json");   // 损坏数据
  w2.localStorage.setItem("engines", "not-json");
  w2.eval(appCode);
  await waitFor(() => w2.document.getElementById("engine").options.length === 5, "损坏数据回退默认引擎完成");
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
  w3.fetch = window.fetch;
  Object.defineProperty(w3, "localStorage", { get() { throw new Error("denied"); } });
  let denied = false;
  try { w3.eval(appCode); await waitFor(() => w3.document.getElementById("engine").options.length === 5, "隐私模式下默认引擎渲染完成"); }
  catch { denied = true; }
  assert(!denied, "localStorage 禁用时不抛异常");
  assert(w3.document.getElementById("sites").querySelectorAll("a.shortcut").length === 4,
    "localStorage 禁用时仍从 config.json 渲染 4 张卡片");
  assert(w3.document.getElementById("engine").options.length === 5, "localStorage 禁用时默认引擎可用");

  // ---- 6.1 旧版分散 key 自动迁移为统一 key ----
  const dom4 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w4 = dom4.window;
  w4.matchMedia = () => ({ matches: false });
  w4.fetch = window.fetch;
  w4.navigator.language = "zh-CN"; // 固定系统语言为中文：英文标题只可能来自迁移的 lang=en
  w4.localStorage.setItem("homepage", JSON.stringify({ // 旧格式：无 version，含 search
    search: "https://legacy.example.com/search?q=%s",
    sites: [{ name: "旧站", url: "https://legacy.example.com", iconType: "auto", icon: "" }],
    layout: { columns: 4, hide: false }
  }));
  w4.localStorage.setItem("engines", JSON.stringify([{ name: "旧引擎", url: "https://legacy.example.com/search?q=%s", keyword: "l" }]));
  w4.localStorage.setItem("engineIndex", "0");
  w4.localStorage.setItem("theme", "dark");
  w4.localStorage.setItem("lang", "en");
  w4.eval(appCode);
  await waitFor(() => w4.document.querySelector(".logo").textContent === "Custom Start Page", "旧数据迁移完成");
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

  // ---- 系统主题跟随 matchMedia ----
  const domDark = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const wDark = domDark.window;
  wDark.matchMedia = () => ({ matches: true }); // 系统为暗色
  wDark.fetch = window.fetch;
  wDark.eval(appCode);
  await waitFor(() => wDark.document.getElementById("engine").options.length === 5, "系统暗色主题初始化完成");
  assert(wDark.document.body.classList.contains("dark"), "system 主题跟随系统暗色偏好");

  // ---- fetch 返回 HTTP 非 200 时回退默认配置 ----
  const dom500 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w500 = dom500.window;
  w500.matchMedia = () => ({ matches: false });
  w500.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  w500.eval(appCode);
  await waitFor(() => w500.document.getElementById("engine").options.length === 5, "HTTP 500 回退默认配置完成");
  assert(w500.document.getElementById("sites").querySelectorAll("a.shortcut").length === 0,
    "HTTP 500 时回退空配置不崩溃");

  // ---- 8.1 编辑引擎时校验关键词重复 ----
  // ---- 8.2 删除引擎后索引越界自动回退，派生搜索无失效引用 ----
  const dom5 = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const w5 = dom5.window;
  w5.matchMedia = () => ({ matches: false });
  w5.fetch = window.fetch;
  Object.defineProperty(w5.navigator, "language", { value: "zh-CN", configurable: true });
  w5.eval(appCode);
  await waitFor(() => w5.document.getElementById("engine").options.length === 5, "dom5 初始渲染完成");

  // 8.1 编辑关键词为已有值 → 拒绝；不重复 → 允许（通过 data-field 定位，避免依赖结构顺序）
  const item1Keyword = w5.document.querySelector(
    '#engine-list .engine-sort-item[data-index="1"] input[data-field="keyword"]');
  const toast5 = w5.document.getElementById("toast");
  toast5.textContent = "";
  item1Keyword.value = "g"; // 与第 1 个引擎（Google, keyword=g）重复
  item1Keyword.dispatchEvent(new w5.Event("change", { bubbles: true }));
  assert(toast5.textContent === "关键词重复", "编辑引擎为重复关键词被拒绝并提示具体文案");
  assert(JSON.parse(w5.localStorage.getItem("homepage")).engines[1].keyword === "b",
    "重复关键词未写入");
  toast5.textContent = "";
  item1Keyword.value = "zz";
  item1Keyword.dispatchEvent(new w5.Event("change", { bubbles: true }));
  assert(toast5.textContent === "" &&
    JSON.parse(w5.localStorage.getItem("homepage")).engines[1].keyword === "zz",
    "不重复的关键词可正常编辑");

  // 8.2 选中最后一个引擎后删除第一个 → 原选中引擎保留（索引收敛到最后一项），无失效引用
  const engineSel5 = w5.document.getElementById("engine");
  engineSel5.value = "4";
  engineSel5.dispatchEvent(new w5.Event("change"));
  assert(JSON.parse(w5.localStorage.getItem("homepage")).engineIndex === 4, "已选中最后一个引擎");
  w5.document.querySelector("#engine-list .engine-sort-item button").click(); // 删除第 1 个（Google）
  const st5 = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(st5.engines.length === 4, "删除后剩 4 个引擎");
  assert(st5.engineIndex === 3, "原选中引擎保留，索引收敛到最后一项（3）");
  assert(st5.search === undefined, "无失效的 search 引用（搜索地址由 engines[engineIndex] 派生）");
  assert(engineSel5.value === "3", "下拉框同步到收敛后的索引");

  // ---- 搜索提交核心逻辑：普通 / 快捷关键词 / ! 强制当前引擎 ----
  const domSearch = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", virtualConsole: vc });
  const wSearch = domSearch.window;
  wSearch.matchMedia = () => ({ matches: false });
  wSearch.fetch = window.fetch;
  let navigatedUrl = null;
  wSearch.document.addEventListener("startpage:navigate", e => { navigatedUrl = e.detail.url; });
  wSearch.eval(appCode);
  await waitFor(() => wSearch.document.getElementById("engine").options.length === 5, "搜索测试初始化完成");
  const searchForm = wSearch.document.getElementById("search");
  const searchInput = wSearch.document.getElementById("query");
  function submitSearch(text) {
    navigatedUrl = null;
    searchInput.value = text;
    searchForm.dispatchEvent(new wSearch.Event("submit", { bubbles: true, cancelable: true }));
    return navigatedUrl;
  }
  assert(submitSearch("hello") === "https://www.google.com/search?q=hello",
    "普通搜索使用当前引擎（Google）");
  assert(submitSearch("g test") === "https://www.google.com/search?q=test",
    "快捷关键词 g 命中 Google");
  wSearch.document.getElementById("engine").value = "1";
  wSearch.document.getElementById("engine").dispatchEvent(new wSearch.Event("change"));
  assert(submitSearch("!bing") === "https://www.bing.com/search?q=bing",
    "! 强制使用当前引擎（Bing）");

  // 切换引擎后重新打开菜单，选中态应同步到新引擎
  wSearch.document.getElementById("search-engine-btn").click();
  wSearch.document.querySelector('.search-engine-item[data-index="1"]').click();
  wSearch.document.getElementById("search-engine-btn").click();
  assert(wSearch.document.querySelector(".search-engine-item.active") &&
    wSearch.document.querySelector(".search-engine-item.active").dataset.index === "1",
    "切换引擎后重新打开菜单，active 选中态立即更新");
  wSearch.document.body.click();

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
  const exp5 = JSON.parse(await readBlobText(w5, blob5));
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
  w5.document.getElementById("settings").click(); // 打开设置面板，渲染卡片管理列表
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

  // ---- 14.x 自定义配色（主题选择框选"自定义配色"后出现配置面板）----
  const colorForm = w5.document.getElementById("color-form");
  const themeModeSel5 = w5.document.getElementById("theme-mode");
  assert(!colorForm.classList.contains("show"), "主题非 custom 时配置面板隐藏");
  themeModeSel5.value = "custom";
  themeModeSel5.dispatchEvent(new w5.Event("change"));
  assert(colorForm.classList.contains("show"), "选中自定义配色后出现配置面板");
  assert(JSON.parse(w5.localStorage.getItem("homepage")).theme === "custom",
    "主题模式 custom 已持久化");

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

  // 保存 → 持久化（custom 模式下配置面板保持打开）
  w5.document.getElementById("color-save").click();
  const colState = JSON.parse(w5.localStorage.getItem("homepage")).colors;
  assert(colState && colState.bg === "#112233" && colState.card === "#445566" &&
    colState.text === "#aabbcc" && colState.secondary === "#ddeeff" && colState.border === "#010203",
    "保存后 5 个配色持久化到统一存储");
  assert(colorForm.classList.contains("show"), "custom 模式下保存后配置面板保持打开");

  // 再改颜色（预览）→ 取消 → 恢复已保存值
  w5.document.getElementById("color-bg").value = "#fedcba";
  w5.document.getElementById("color-bg").dispatchEvent(new w5.Event("input", { bubbles: true }));
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#fedcba",
    "input 事件实时预览生效");
  w5.document.getElementById("color-cancel").click();
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#112233",
    "取消后撤销预览，恢复已保存配色");
  assert(w5.document.getElementById("color-bg").value === "#112233",
    "取消后颜色控件同步回已保存值");

  // 恢复默认：colors 置 null 并移除内联变量
  w5.document.getElementById("color-reset").click();
  const afterReset = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(afterReset.colors === null, "恢复默认后 colors 为 null");
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "",
    "恢复默认后内联变量被移除");

  // 切回浅色 → 配置面板隐藏，自定义配色不再应用
  themeModeSel5.value = "light";
  themeModeSel5.dispatchEvent(new w5.Event("change"));
  assert(!colorForm.classList.contains("show"), "切回普通主题后配置面板隐藏");
  assert(w5.document.body.classList.contains("dark") === false, "浅色主题正常应用");

  // 导入非法配色 → 归一化为 null
  const badColorFile = new w5.File([JSON.stringify({
    sites: [], colors: { bg: "red", card: "#ffffff", text: "#000000", secondary: "#666666", border: "#cccccc" }
  })], "badcolor.json", { type: "application/json" });
  Object.defineProperty(w5.document.getElementById("import-data"), "files",
    { value: [badColorFile], configurable: true });
  w5.document.getElementById("import-data").dispatchEvent(new w5.Event("change"));
  await waitFor(() => {
    try { return JSON.parse(w5.localStorage.getItem("homepage")).colors === null; }
    catch (e) { return false; }
  }, "非法配色导入完成");
  const afterBadColor = JSON.parse(w5.localStorage.getItem("homepage"));
  assert(afterBadColor.colors === null, "含非法色值的配色数据被归一化为 null");

  // ---- 15.x 导入后主题/语言/配色立即生效（无需刷新）----
  const importApplyFile = new w5.File([JSON.stringify({
    version: 2,
    sites: [], engines: [],
    layout: { columns: 6, hide: false },
    theme: "custom", lang: "en",
    colors: { bg: "#010101", card: "#020202", text: "#030303", secondary: "#040404", border: "#050505" }
  })], "apply.json", { type: "application/json" });
  Object.defineProperty(w5.document.getElementById("import-data"), "files",
    { value: [importApplyFile], configurable: true });
  w5.document.getElementById("import-data").dispatchEvent(new w5.Event("change"));
  await waitFor(() => w5.document.body.style.getPropertyValue("--bg").trim() === "#010101",
    "导入立即生效完成");
  assert(w5.document.body.style.getPropertyValue("--bg").trim() === "#010101",
    "导入后配色立即应用（body 变量）");
  assert(w5.document.querySelector(".logo").textContent === "Custom Start Page",
    "导入后语言立即生效");
  assert(w5.document.getElementById("color-form").classList.contains("show"),
    "导入 custom 主题后配置面板出现");

  console.log(failures === 0 ? "\n全部通过 ✔" : `\n${failures} 项失败 ✘`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("测试脚本异常:", e); process.exit(1); });
