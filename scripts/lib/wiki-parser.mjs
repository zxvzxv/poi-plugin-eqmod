import * as cheerio from "cheerio";

export const VALID_STAGES = new Set(["0-5", "6-9", "max"]);
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];
const CELL_BREAK = "\u001f";

export function normalizeName(value) {
  return String(value ?? "").normalize("NFKC").replace(/[\s・･]/g, "").replace(/[（）]/g, (c) => c === "（" ? "(" : ")").toLowerCase();
}

const clean = (value) => String(value ?? "").replace(/\[[^\]]*\]/g, "").replace(/[\t\r ]+/g, " ").replace(/\n+/g, " ").trim();
const integer = (value) => {
  const match = clean(value).match(/\d+/);
  return match ? Number(match[0]) : 0;
};

export function expandTable($, table) {
  const grid = [];
  $(table).find("tr").each((rowIndex, tr) => {
    grid[rowIndex] ??= [];
    let column = 0;
    $(tr).children("th,td").each((_cellIndex, cell) => {
      while (grid[rowIndex][column] !== undefined) column += 1;
      const rowspan = Math.max(1, Number($(cell).attr("rowspan")) || 1);
      const colspan = Math.max(1, Number($(cell).attr("colspan")) || 1);
      const clone = $(cell).clone();
      clone.find("br").replaceWith(CELL_BREAK);
      const value = clean(clone.text());
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
  if (/更新|MAX.*(?:更新|→)|★MAX/.test(text) && !/6.*MAX/.test(text)) return "max";
  if (/6.*(?:9|MAX)|^★\s*6(?:\s*[～~\-].*)?$/.test(text)) return "6-9";
  return "0-5";
}

function weekdaysOf(text) {
  const normalized = clean(text);
  if (!normalized || /毎日|全日|いつでも|任意/.test(normalized)) return [0, 1, 2, 3, 4, 5, 6];
  return DAYS.flatMap((day, index) => normalized.includes(day) || normalized.includes(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][index]) ? [index] : []);
}

function pairText(value) {
  const values = clean(value).match(/\d+/g) ?? [];
  return values.length > 1 ? `${values[0]}/${values[1]}` : (values[0] ?? "0");
}

function materialText(value, equipmentName) {
  const text = clean(value).split(CELL_BREAK).map(clean).filter(Boolean).join(" ");
  if (!text || /^(?:[-―—]|不要)$/.test(text)) return "なし";
  return text.replace(/同装備/g, equipmentName).replace(/\s*[×X]\s*/gi, "x");
}

function updateText(value) {
  const text = clean(value).replace(/^[⇒→]+/, "");
  const withoutNote = text.split(new RegExp(`${CELL_BREAK}+\\s*※|${CELL_BREAK}{2,}`), 1)[0];
  return withoutNote.split(CELL_BREAK).map(clean).filter(Boolean).join(" / ") || "更新不可";
}

function weekdayMask(values) {
  return values.map((value) => /◯|○|〇/.test(value) ? "1" : "0").join("");
}

function mergeMask(left = "0000000", right = "0000000") {
  return DAYS.map((_day, index) => left[index] === "1" || right[index] === "1" ? "1" : "0").join("");
}

function headerIndex(headers, patterns, fallback) {
  const found = headers.findIndex((header) => patterns.some((pattern) => pattern.test(header)));
  return found < 0 ? fallback : found;
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

export function parseWikiHtml(html, _equipmentMaster = []) {
  const $ = cheerio.load(html);
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
      development: headerIndex(headers, [/開発\s*資材|开发资材/], 6), improvement: headerIndex(headers, [/改修\s*資材|ネジ/], 7),
      materials: headerIndex(headers, [/消費装備|必要装備|素材/], 8), weekdays: headerIndex(headers, [/曜日/], 9),
      secretary: headerIndex(headers, [/二番艦|担当艦|秘書艦/], 10), upgrade: headerIndex(headers, [/更新先|更新装備/], 11),
    };
    const category = tableCategories.get(table) || `表 ${tableIndex + 1}`;
    categories.add(category);
    tableStats.push({ tableIndex, columns: grid[headerRow].length, rows: grid.length - headerRow - 1 });
    let lastName = "";
    for (const row of grid.slice(headerRow + 1)) {
      if (wiki16 && /改修値/.test(row[1])) continue;
      const suppliedName = clean(row[indexes.name]);
      const name = suppliedName || lastName;
      if (!name || /装備名|備考|注[:：]?/.test(name)) continue;
      lastName = name;
      const anchorNode = $(table).find(`[id]`).filter((_i, node) => normalizeName($(node).text()).includes(normalizeName(name))).first();
      const anchor = anchorNode.attr("id") || undefined;
      if (anchor) anchors.set(anchor, (anchors.get(anchor) ?? 0) + 1);
      const normalizedName = normalizeName(name);
      let recipe = equipment.find((item) => item.normalizedName === normalizedName);
      if (!recipe) {
        const resources = wiki16
          ? resourcesOf(row[2])
          : { fuel: integer(row[indexes.fuel]), ammo: integer(row[indexes.ammo]), steel: integer(row[indexes.steel]), bauxite: integer(row[indexes.bauxite]) };
        recipe = { wikiName: name, normalizedName, category, res: [resources.fuel, resources.ammo, resources.steel, resources.bauxite], variants: [] };
        equipment.push(recipe);
      }

      const stage = stageOf(row[indexes.stage]);
      const rank = { "0-5": 0, "6-9": 1, max: 2 }[stage];
      const stageValue = [
        pairText(row[wiki16 ? 3 : indexes.development]),
        pairText(row[wiki16 ? 4 : indexes.improvement]),
        materialText(row[wiki16 ? 5 : indexes.materials], name),
      ];
      const update = updateText(row[wiki16 ? 15 : indexes.upgrade]);
      let variant = recipe.variants.at(-1);
      const existingStage = variant?.stages[stage];
      const startsNextBranch = variant && (
        rank < variant._lastStageRank
        || (existingStage && JSON.stringify(existingStage) !== JSON.stringify(stageValue))
        || variant._update !== update
      );
      if (!variant || startsNextBranch) {
        const inheritedStages = variant && rank >= variant._lastStageRank
          ? Object.fromEntries(Object.entries(variant.stages).filter(([key]) => ({ "0-5": 0, "6-9": 1, max: 2 })[key] < rank))
          : {};
        variant = { sub_ships: {}, stages: inheritedStages, _lastStageRank: rank - 1, _update: update };
        recipe.variants.push(variant);
      }
      variant.stages[stage] ??= stageValue;
      variant._lastStageRank = Math.max(variant._lastStageRank, rank);

      const rawWeekdays = row[indexes.weekdays] ?? "";
      const mask = wiki16
        ? weekdayMask(row.slice(7, 14))
        : DAYS.map((_day, index) => weekdaysOf(rawWeekdays).includes(index) ? "1" : "0").join("");
      const secretaries = clean(row[wiki16 ? 14 : indexes.secretary])
        .split(new RegExp(`[${CELL_BREAK}、,/／]`))
        .map(clean)
        .filter((value) => value && value !== "-");
      for (const secretary of secretaries) variant.sub_ships[secretary] = mergeMask(variant.sub_ships[secretary], mask);
    }
  });
  for (const item of equipment) for (const variant of item.variants) {
    variant.stages.update = variant._update;
    delete variant._lastStageRank;
    delete variant._update;
  }
  return { equipment, categories: [...categories], unmatched: [], tableStats, tablePreviews, duplicateAnchors: [...anchors].filter(([, count]) => count > 1).map(([anchor]) => anchor) };
}

export function validateDatabase(database, options = {}) {
  const errors = [];
  const minimumEquipment = options.minimumEquipment ?? 1;
  if (!Array.isArray(database.equipment) || database.equipment.length < minimumEquipment) errors.push(`装备数量少于 ${minimumEquipment}`);
  for (const item of database.equipment ?? []) {
    if (!item.wikiName || !item.normalizedName || !item.category || !Array.isArray(item.res) || item.res.length !== 4 || !Array.isArray(item.variants) || item.variants.length === 0) errors.push(`装备记录不完整: ${item.wikiName ?? "(未知)"}`);
    for (const variant of item.variants ?? []) {
      if (!variant.sub_ships || !variant.stages || typeof variant.stages.update !== "string") errors.push(`配方字段不完整: ${item.wikiName}`);
      for (const [stage, value] of Object.entries(variant.stages ?? {})) {
        if (stage === "update") continue;
        if (!VALID_STAGES.has(stage) || !Array.isArray(value) || value.length !== 3) errors.push(`未知或无效阶段: ${item.wikiName}/${stage}`);
      }
      for (const [ship, mask] of Object.entries(variant.sub_ships ?? {})) if (!/^[01]{7}$/.test(mask)) errors.push(`二号舰日期无效: ${item.wikiName}/${ship}`);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  return database;
}

export function makeDatabase(_html, parsed, metadata = {}) {
  return validateDatabase({
    equipment: parsed.equipment,
  }, { minimumEquipment: metadata.minimumEquipment ?? 1 });
}

export function diffDatabases(before, after) {
  const oldItems = new Map((before?.equipment ?? []).map((item) => [item.normalizedName, item]));
  const newItems = new Map(after.equipment.map((item) => [item.normalizedName, item]));
  const added = [...newItems].filter(([name]) => !oldItems.has(name)).map(([, item]) => item.wikiName);
  const removed = [...oldItems].filter(([name]) => !newItems.has(name)).map(([, item]) => item.wikiName);
  const changed = [...newItems].filter(([name, item]) => oldItems.has(name) && JSON.stringify(oldItems.get(name)) !== JSON.stringify(item)).map(([, item]) => item.wikiName);
  return { added, removed, changed, unmatched: after.unmatched ?? [] };
}
