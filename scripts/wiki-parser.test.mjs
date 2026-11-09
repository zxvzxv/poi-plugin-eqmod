import { describe, expect, it } from "vitest";
import * as cheerio from "cheerio";
import { expandTable, makeDatabase, normalizeName, parseWikiHtml, validateDatabase } from "./lib/wiki-parser.mjs";

const masters = [
  { api_id: 1, api_name: "正しい装備A" },
  { api_id: 2, api_name: "正しい装備B" },
  { api_id: 3, api_name: "更新装備" },
];

const html = `<!doctype html><html><body><h2>主砲</h2><table>
<tr><th rowspan="2">装備名</th><th rowspan="2">改修段階</th><th colspan="4">資源</th><th rowspan="2">開発資材</th><th rowspan="2">改修資材</th><th rowspan="2">消費装備</th><th rowspan="2">曜日</th><th rowspan="2">二番艦</th><th rowspan="2">更新先</th></tr>
<tr><th>燃料</th><th>弾薬</th><th>鋼材</th><th>ボーキ</th></tr>
<tr><td rowspan="3"><span id="wrong-anchor-b">正しい装備A</span></td><td>★0～★6</td><td>10</td><td>20</td><td>30</td><td>40</td><td>1/2</td><td>2/3</td><td>なし</td><td>月火※条件</td><td>艦A/艦B</td><td>-</td></tr>
<tr><td>★6</td><td>11</td><td>21</td><td>31</td><td>41</td><td>2/3</td><td>3/4</td><td>正しい装備B ×2</td><td>水</td><td>艦C</td><td>-</td></tr>
<tr><td>更新</td><td>12</td><td>22</td><td>32</td><td>42</td><td>4/5</td><td>5/6</td><td>新型砲熕兵装資材 ×1</td><td>木</td><td>艦D</td><td>更新装備</td></tr>
<tr><td><span id="wrong-anchor-a">正しい装備B</span></td><td>★0～★6</td><td>1</td><td>2</td><td>3</td><td>4</td><td>1</td><td>1</td><td>-</td><td>毎日</td><td>-</td><td>-</td></tr>
</table></body></html>`;

describe("wiki parser", () => {
  it("expands rowspan and colspan into a rectangular grid", () => {
    const $ = cheerio.load(html);
    const grid = expandTable($, $("table")[0]);
    expect(grid[0]).toHaveLength(12);
    expect(grid[0].slice(2, 6)).toEqual(["資源", "資源", "資源", "資源"]);
    expect(grid[4][0]).toBe("正しい装備A");
  });

  it("parses stages, branches, weekdays, materials and updates", () => {
    const parsed = parseWikiHtml(html, masters);
    expect(parsed.equipment).toHaveLength(2);
    const first = parsed.equipment[0];
    expect(first.equipmentId).toBe(1);
    expect(first.variants.map((x) => x.stage)).toEqual(["0-5", "6-9", "upgrade"]);
    expect(first.variants[0]).toMatchObject({ weekdays: [1, 2], weekdayConditional: true, secretary: ["艦A", "艦B"] });
    expect(first.variants[0].materials).toEqual([]);
    expect(first.variants[1].materials[0]).toMatchObject({ equipmentId: 2, count: 2 });
    expect(first.variants[2].upgradeTo).toMatchObject({ equipmentId: 3, name: "更新装備" });
  });

  it("uses normalized official names instead of misleading anchors", () => {
    const parsed = parseWikiHtml(html, masters);
    expect(parsed.equipment[0]).toMatchObject({ equipmentId: 1, wikiName: "正しい装備A", anchor: "wrong-anchor-b" });
    expect(parsed.equipment[1]).toMatchObject({ equipmentId: 2, wikiName: "正しい装備B", anchor: "wrong-anchor-a" });
    expect(normalizeName("Ａ （試製）")).toBe("a(試製)");
  });

  it("validates the complete generated structure", () => {
    const parsed = parseWikiHtml(html, masters);
    expect(() => makeDatabase(html, parsed, { minimumEquipment: 2 })).not.toThrow();
    expect(() => validateDatabase({ schemaVersion: 1, equipment: [] }, { minimumEquipment: 1 })).toThrow(/装备数量/);
  });
});
