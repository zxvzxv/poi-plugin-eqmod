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
<tr><td rowspan="3"><span id="wrong-anchor-b">正しい装備A</span></td><td>★0～★6</td><td>10</td><td>20</td><td>30</td><td>40</td><td>1/2</td><td>2/3</td><td>なし</td><td>月火※条件</td><td>艦A/艦B</td><td rowspan="3">更新装備<br><br>※二番艦で更新先が分岐</td></tr>
<tr><td>★6</td><td>11</td><td>21</td><td>31</td><td>41</td><td>2/3</td><td>3/4</td><td>正しい装備B ×2</td><td>水</td><td>艦C</td></tr>
<tr><td>更新</td><td>12</td><td>22</td><td>32</td><td>42</td><td>4/5</td><td>5/6</td><td>新型砲熕兵装資材 ×1</td><td>木</td><td>艦D</td></tr>
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
    expect(first.res).toEqual([10, 20, 30, 40]);
    expect(first.variants).toHaveLength(1);
    expect(first.variants[0]).toEqual({
      sub_ships: { "艦A": "0110000", "艦B": "0110000", "艦C": "0001000", "艦D": "0000100" },
      stages: {
        "0-5": ["1/2", "2/3", "なし"],
        "6-9": ["2/3", "3/4", "正しい装備Bx2"],
        max: ["4/5", "5/6", "新型砲熕兵装資材x1"],
        update: "更新装備",
      },
    });
  });

  it("uses normalized official names instead of misleading anchors", () => {
    const parsed = parseWikiHtml(html, masters);
    expect(parsed.equipment[0]).toMatchObject({ wikiName: "正しい装備A" });
    expect(parsed.equipment[1]).toMatchObject({ wikiName: "正しい装備B" });
    expect(normalizeName("Ａ （試製）")).toBe("a(試製)");
  });

  it("validates the complete generated structure", () => {
    const parsed = parseWikiHtml(html, masters);
    expect(() => makeDatabase(html, parsed, { minimumEquipment: 2 })).not.toThrow();
    expect(() => validateDatabase({ equipment: [] }, { minimumEquipment: 1 })).toThrow(/装备数量/);
  });
});
