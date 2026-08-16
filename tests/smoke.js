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
  menu.querySelector(".search-engine-item").click(); // 选择当前引擎
  assert(!menu.classList.contains("open"), "选择引擎后菜单关闭");
  const saved = JSON.parse(window.localStorage.getItem("homepage"));
  assert(saved.search === "https://www.google.com/search?q=", "config.search 已同步并持久化");

  // ---- 国际化切换 ----
  const langSel = document.getElementById("lang-mode");
  langSel.value = "en";
  langSel.dispatchEvent(new window.Event("change"));
  assert(document.querySelector(".logo").textContent === "Custom Start Page", "切英文后标题变为英文");
  langSel.value = "zh";
  langSel.dispatchEvent(new window.Event("change"));
  assert(document.querySelector(".logo").textContent === "自定义起始页", "切回中文后标题恢复");

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
  const savedEngines = JSON.parse(window.localStorage.getItem("engines"));
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

  // ================= 健壮性用例（参考建议 3.1–3.4） =================

  // ---- 3.4 添加无效搜索地址被拒绝 ----
  let lastAlert = null;
  window.alert = m => { lastAlert = m; };
  document.getElementById("engine-name").value = "坏引擎";
  document.getElementById("engine-url").value = "https://example.com"; // 无查询参数
  document.getElementById("save-engine").click();
  assert(lastAlert !== null, "无查询参数的搜索地址被拒绝并提示");
  assert(JSON.parse(window.localStorage.getItem("engines")).length === 5, "拒绝后引擎列表未变化");
  window.alert = () => {};

  // ---- 3.2 导入结构损坏的数据被归一化 ----
  const importInput = document.getElementById("import-data");
  const badFile = new window.File([JSON.stringify({
    sites: "not-an-array",                                   // 类型错误
    layout: { columns: "abc", hide: true },                  // 非法列数
    engines: [null, { name: "E1", url: "https://e1.com/search?q=" }], // 含非法条目
    engineIndex: 0
  })], "bad.json", { type: "application/json" });
  Object.defineProperty(importInput, "files", { value: [badFile] });
  importInput.dispatchEvent(new window.Event("change"));
  await new Promise(r => setTimeout(r, 100));
  const norm = JSON.parse(window.localStorage.getItem("homepage"));
  assert(Array.isArray(norm.sites) && norm.sites.length === 0, "导入时 sites 非数组 → 归一化为空数组");
  assert(norm.layout.columns === 6 && norm.layout.hide === true, "导入时非法列数 → 回退默认 6，hide 保留");
  const impEngines = JSON.parse(window.localStorage.getItem("engines"));
  assert(impEngines.length === 1 && impEngines[0].name === "E1", "导入引擎跳过非法条目，只保留合法项");

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

  console.log(failures === 0 ? "\n全部通过 ✔" : `\n${failures} 项失败 ✘`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error("测试脚本异常:", e); process.exit(1); });
