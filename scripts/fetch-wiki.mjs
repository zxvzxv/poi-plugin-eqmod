import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetch, ProxyAgent } from "undici";
import { diffDatabases, makeDatabase, parseWikiHtml } from "./lib/wiki-parser.mjs";

const SOURCE_URL = "https://wikiwiki.jp/kancolle/%E6%94%B9%E4%BF%AE%E8%A1%A8";
const args = process.argv.slice(2);
const valueOf = (flag) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] : undefined; };
const proxy = valueOf("--proxy") ?? process.env.HTTPS_PROXY ?? process.env.https_proxy;
const output = resolve(valueOf("--output") ?? "src/data/improvements.json");
const userAgent = "poi-plugin-eqmod-data-updater/0.1 (desktop; wiki data review tool)";

const dispatcher = proxy ? new ProxyAgent(proxy) : undefined;
let response;
for (let attempt = 1; attempt <= 3; attempt += 1) {
  try {
    response = await fetch(SOURCE_URL, {
      ...(dispatcher ? { dispatcher } : {}),
      headers: { "user-agent": userAgent, accept: "text/html,application/xhtml+xml", "accept-language": "ja,en;q=0.8" },
      redirect: "follow",
    });
    break;
  } catch (error) {
    if (attempt === 3) throw error;
    console.warn(`网络请求失败，第 ${attempt}/3 次重试`);
    await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 500));
  }
}
if (!response) throw new Error("未收到 wiki 响应");
if (response.status !== 200) throw new Error(`wiki 请求失败: HTTP ${response.status}`);
const contentType = response.headers.get("content-type") ?? "";
if (!contentType.includes("text/html")) throw new Error(`响应不是 HTML: ${contentType}`);
const html = await response.text();
if (html.length < 50000 || !/改修工廠|改修表/.test(html) || !/<table/i.test(html)) throw new Error("wiki 页面结构不符合预期，拒绝覆盖数据库");

let master = [];
try { master = JSON.parse(await readFile(resolve("data/equipment-master.json"), "utf8")); } catch { /* Name-only output remains reviewable. */ }
const parsed = parseWikiHtml(html, master);
if (parsed.tableStats.length < 3) throw new Error(`仅识别到 ${parsed.tableStats.length} 个改修表\n页面表格预览:\n${parsed.tablePreviews.join("\n")}`);
if (parsed.tableStats.some((table) => table.columns < 10)) throw new Error("改修表逻辑列数异常");
if (parsed.duplicateAnchors.length) console.warn(`警告: 重复锚点 ${parsed.duplicateAnchors.join(", ")}；装备仍按名称关联`);
const pageUpdatedAt = html.match(/(?:最終更新|Last-modified)[:：]?\s*([^<]+)/i)?.[1]?.trim() ?? null;
const database = makeDatabase(html, parsed, { url: SOURCE_URL, pageUpdatedAt, etag: response.headers.get("etag"), minimumEquipment: 50 });

let previous = null;
try { previous = JSON.parse(await readFile(output, "utf8")); } catch { /* First generation. */ }
const summary = diffDatabases(previous, database);
console.log(`新增 ${summary.added.length} / 删除 ${summary.removed.length} / 变化 ${summary.changed.length} / 未匹配 ${summary.unmatched.length}`);
for (const [label, values] of [["新增", summary.added], ["删除", summary.removed], ["变化", summary.changed], ["未匹配", summary.unmatched]]) if (values.length) console.log(`${label}: ${values.join("、")}`);

const temporary = `${output}.tmp`;
try {
  await writeFile(temporary, `${JSON.stringify(database, null, 2)}\n`, "utf8");
  await rename(temporary, output);
} catch (error) {
  await unlink(temporary).catch(() => {});
  throw error;
}
console.log(`已写入 ${output}`);
