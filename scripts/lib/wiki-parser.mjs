import * as cheerio from "cheerio";
import { createHash } from "node:crypto";

export const VALID_STAGES = new Set(["0-5", "6-9", "upgrade"]);
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s・･]/g, "").replace(/[（）]/g, (c) => c === "（" ? "(" : ")").toLowerCase();
}

const clean = (value) => String(value ?? "").replace(/\[[^\]]*\]/g, "").replace(/[\t\r ]+/g, " ").replace(/\n+/g, " ").trim();
const integer = (value) => {
  const match = clean(value).match(/\d+/);
  return match ? Number(match[0]) : 0;
};
const nullableInteger = (value) => /[-―—なし]/.test(clean(value)) && !/\d/.test(clean(value)) ? null : integer(value);

export function expandTable($, table) {
  const grid = [];
  $(table).find("tr").each((rowIndex, tr) => {
    grid[rowIndex] ??= [];
    let column = 0;
    $(tr).children("th,td").each((_cellIndex, cell) => {
      while (grid[rowIndex][column] !== undefined) column += 1;
      const rowspan = Math.max(1, Number($(cell).attr("rowspan")) || 1);
      const colspan = Math.max(1, Number($(cell).attr("colspan")) || 1);
      const value = clean($(cell).text());
      for (let y = 0; y < rowspan; y += 1) {
        grid[rowIndex + y] ??= [];
        for (let x = 0; x < colspan; x += 1) grid[rowIndex + y][column + x] = value;
      }
      column += colspan;
    });
  });
  const width = Math.max(0, ...grid.map((row) => row.length));
  return grid.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""));
}

function stageOf(value) {
  const text = clean(value).toUpperCase();
  if (/更新|MAX.*(?:更新|→)|★MAX/.test(text) && !/6.*MAX/.test(text)) return "upgrade";
  if (/6.*(?:9|MAX)|^★\s*6(?:\s*[～~\-].*)?$/.test(text)) return "6-9";
  return "0-5";
}

function weekdaysOf(text) {
  const normalized = clean(text);
  if (!normalized || /毎日|全日|いつでも|任意/.test(normalized)) return [0, 1, 2, 3, 4, 5, 6];
  return DAYS.flatMap((day, index) => normalized.includes(day) || normalized.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]) ? [index] : []);
}

function pairOf(text) {
  const values = clean(text).match(/\d+/g)?.map(Number) ?? [];
  return { normal: values[0] ?? 0, guaranteed: values[1] ?? (values[0] ?? null) };
}

function headerIndex(headers, patterns, fallback) {
  const found = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  return found < 0 ? fallback : found;
}

function parseMaterials(text, masterByName, currentName = "") {
  const value = clean(text);
  if (!value || /^(?:[-―—]|なし|不要)$/.test(value)) return [];
  const compactMatches = [...value.matchAll(/(.+?)[x×](\d+)(?=(?:.+?)[x×]\d+|$)/gi)];
  const parts = compactMatches.length ? compactMatches.map((match) => `${match[1]} x${match[2]}`) : value.split(/[、,+＋]/);
  return parts.map((part) => {
    const countMatch = part.match(/(?:x|×|\*)\s*(\d+)|(\d+)\s*(?:個|基|機|門)/i);
    const count = Number(countMatch?.[1] ?? countMatch?.[2] ?? 1);
    const parsedName = clean(part.replace(/(?:x|×|\*)\s*\d+|\d+\s*(?:個|基|機|門)/gi, ""));
    const name = /^(?:同装備|同装备)$/.test(parsedName) ? currentName : parsedName;
    const master = masterByName.get(normalizeName(name));
    return { ...(master ? { equipmentId: master.api_id } : {}), name, count, ...(!master && /資材|詳報|熟練搭乗員|航空兵装/.test(name) ? { special: true } : {}) };
  }).filter((item) => item.name);
}

function resourcesOf(text) {
  const value = clean(text);
  const labeled = (patterns) => {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) return Number(match[1]);
    }
    return 0;
  };
  return {
    fuel: labeled([/燃[:：]?\s*(\d+)/, /燃料[:：]?\s*(\d+)/]),
    ammo: labeled([/弾[:：]?\s*(\d+)/, /弾薬[:：]?\s*(\d+)/]),
    steel: labeled([/鋼[:：]?\s*(\d+)/, /鋼材[:：]?\s*(\d+)/]),
    bauxite: labeled([/ボ[:：]?\s*(\d+)/, /ボーキ[:：]?\s*(\d+)/]),
  };
}

export function parseWikiHtml(html, equipmentMaster = []) {
  const $ = cheerio.load(html);
  const masterByName = new Map(equipmentMaster.map((item) => [normalizeName(item.api_name), item]));
  const equipment = [];
  const categories = new Set();
  const anchors = new Map();
  const tableStats = [];
  const tablePreviews = [];
  const tableCategories = new Map();
  let latestHeading = "";
  $("h2,h3,h4,h5,table").each((_index, node) => {
    if (node.tagName === "table") tableCategories.set(node, latestHeading);
    else latestHeading = clean($(node).text());
  });
  $("table").each((tableIndex, table) => {
    const grid = expandTable($, table);
    if (grid.length < 2) return;
    if (tablePreviews.length < 12) tablePreviews.push(grid.slice(0, 3).map((row) => row.join(" | ")).join(" /// "));
    const headerRow = grid.findIndex((row) => row.some((cell) => /装備名|装備名称|改修する装備/.test(cell)));
    if (headerRow < 0) return;
    const headers = grid[headerRow];
    const wiki16 = headers.length === 16 && /改修する装備/.test(headers[0]);
    const indexes = {
      name: headerIndex(headers, [/装備名|装備名称|改修する装備/], 0), stage: headerIndex(headers, [/改修段階|改修値|段階|★/], 1),
      fuel: headerIndex(headers, [/燃料|燃$/], 2), ammo: headerIndex(headers, [/弾薬|弾$/], 3),
      steel: headerIndex(headers, [/鋼材|鋼$/], 4), bauxite: headerIndex(headers, [/ボーキ|铝|ボ$/], 5),
      development: headerIndex(headers, [/開発資材|开发资材/], 6), improvement: headerIndex(headers, [/改修資材|ネジ|改修/], 7),
      materials: headerIndex(headers, [/消費装備|必要装備|素材/], 8), weekdays: headerIndex(headers, [/曜日/], 9),
      secretary: headerIndex(headers, [/二番艦|担当艦|秘書艦/], 10), upgrade: headerIndex(headers, [/更新先|更新装備/], 11),
    };
    const category = tableCategories.get(table) || `表 ${tableIndex + 1}`;
    categories.add(category);
    tableStats.push({ tableIndex, columns: grid[headerRow].length, rows: grid.length - headerRow - 1 });
    let lastName = "";
    for (const [rowOffset, row] of grid.slice(headerRow + 1).entries()) {
      if (wiki16 && /改修値/.test(row[1])) continue;
      const suppliedName = clean(row[indexes.name]);
      const name = suppliedName || lastName;
      if (!name || /装備名|備考|注[:：]?/.test(name)) continue;
      lastName = name;
      const master = masterByName.get(normalizeName(name));
      const anchorNode = $(table).find(`[id]`).filter((_i, node) => normalizeName($(node).text()).includes(normalizeName(name))).first();
      const anchor = anchorNode.attr("id") || undefined;
      if (anchor) anchors.set(anchor, (anchors.get(anchor) ?? 0) + 1);
      const rawWeekdays = row[indexes.weekdays] ?? "";
      const upgradeName = clean(row[indexes.upgrade]);
      const variant = {
        id: `${master?.api_id ?? normalizeName(name)}-${tableIndex}-${rowOffset}-${stageOf(row[indexes.stage])}`,
        stage: stageOf(row[indexes.stage]),
        resources: wiki16 ? resourcesOf(row[2]) : { fuel: integer(row[indexes.fuel]), ammo: integer(row[indexes.ammo]), steel: integer(row[indexes.steel]), bauxite: integer(row[indexes.bauxite]) },
        development: pairOf(row[wiki16 ? 3 : indexes.development]), improvement: pairOf(row[wiki16 ? 4 : indexes.improvement]),
        weekdays: wiki16 ? DAYS.map((_day, index) => /◯|○|〇/.test(row[7 + index]) ? index : -1).filter((day) => day >= 0) : weekdaysOf(rawWeekdays),
        ...( /条件|※/.test(wiki16 ? row.slice(7, 14).join("") : rawWeekdays) ? { weekdayConditional: true } : {}),
        secretary: clean(row[wiki16 ? 14 : indexes.secretary]).split(/[、,/／]/).map(clean).filter((value) => value && value !== "-"),
        materials: parseMaterials(row[wiki16 ? 5 : indexes.materials], masterByName, name),
        ...(() => {
          const target = clean(row[wiki16 ? 15 : indexes.upgrade]).replace(/^[⇒→]+/, "");
          if (!target || /^(?:[-―—]|なし|更新不可)$/.test(target)) return {};
          const targetMaster = masterByName.get(normalizeName(target));
          return { upgradeTo: { ...(targetMaster ? { equipmentId: targetMaster.api_id } : {}), name: target } };
        })(),
        notes: row.filter((value) => /※|要熟練|新型/.test(value)).map(clean), sourceText: row.map(clean),
      };
      const normalizedName = normalizeName(name);
      let recipe = equipment.find((item) => item.normalizedName === normalizedName);
      if (!recipe) {
        recipe = { ...(master ? { equipmentId: master.api_id } : {}), wikiName: name, normalizedName, ...(anchor ? { anchor } : {}), category, variants: [] };
        equipment.push(recipe);
      }
      recipe.variants.push(variant);
    }
  });
  return { equipment, categories: [...categories], unmatched: equipment.filter((item) => item.equipmentId == null).map((item) => item.wikiName), tableStats, tablePreviews, duplicateAnchors: [...anchors].filter(([, count]) => count > 1).map(([anchor]) => anchor) };
}

export function validateDatabase(database, options = {}) {
  const errors = [];
  const minimumEquipment = options.minimumEquipment ?? 1;
  if (database.schemaVersion !== 1) errors.push("schemaVersion 必须为 1");
  if (!Array.isArray(database.equipment) || database.equipment.length < minimumEquipment) errors.push(`装备数量少于 ${minimumEquipment}`);
  const ids = new Set();
  for (const item of database.equipment ?? []) {
    if (!item.wikiName || !item.normalizedName || !Array.isArray(item.variants) || item.variants.length === 0) errors.push(`装备记录不完整: ${item.wikiName ?? "(未知)"}`);
    for (const variant of item.variants ?? []) {
      if (!VALID_STAGES.has(variant.stage)) errors.push(`未知阶段: ${variant.stage}`);
      if (ids.has(variant.id)) errors.push(`重复配方 ID: ${variant.id}`);
      ids.add(variant.id);
      if (!variant.resources || !variant.development || !variant.improvement || !Array.isArray(variant.weekdays)) errors.push(`配方字段不完整: ${variant.id}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return database;
}

export function makeDatabase(html, parsed, metadata = {}) {
  return validateDatabase({
    schemaVersion: 1,
    source: { url: metadata.url ?? "", pageUpdatedAt: metadata.pageUpdatedAt ?? null, etag: metadata.etag ?? null, sha256: createHash("sha256").update(html).digest("hex") },
    generatedAt: metadata.generatedAt ?? new Date().toISOString(), categories: parsed.categories, equipment: parsed.equipment, unmatched: parsed.unmatched,
  }, { minimumEquipment: metadata.minimumEquipment ?? 1 });
}

export function diffDatabases(before, after) {
  const oldItems = new Map((before?.equipment ?? []).map((item) => [item.normalizedName, item]));
  const newItems = new Map(after.equipment.map((item) => [item.normalizedName, item]));
  const added = [...newItems].filter(([name]) => !oldItems.has(name)).map(([, item]) => item.wikiName);
  const removed = [...oldItems].filter(([name]) => !newItems.has(name)).map(([, item]) => item.wikiName);
  const changed = [...newItems].filter(([name, item]) => oldItems.has(name) && JSON.stringify(oldItems.get(name)) !== JSON.stringify(item)).map(([, item]) => item.wikiName);
  return { added, removed, changed, unmatched: after.unmatched };
}
