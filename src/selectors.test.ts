import { describe, expect, it } from "vitest";
import { normalizeEquipmentName, recipeAvailableOn, selectEquipmentIcons, selectEquipmentTypeOptions, selectMaterialCounts, selectOwnedRecipes } from "./selectors";
import type { ImprovementDatabase, PoiState } from "./types";

const db: ImprovementDatabase = {
  schemaVersion: 1,
  source: { url: "test", pageUpdatedAt: null, etag: null, sha256: "test" }, generatedAt: "test", categories: ["test"], unmatched: [],
  equipment: [{ equipmentId: 10, wikiName: "試製 砲", normalizedName: normalizeEquipmentName("試製 砲"), category: "test", variants: [{
    id: "test", stage: "0-5", resources: { fuel: 1, ammo: 2, steel: 3, bauxite: 4 },
    development: { normal: 1, guaranteed: 2 }, improvement: { normal: 1, guaranteed: 2 }, weekdays: [1], secretary: [], materials: [], notes: [], sourceText: [],
  }] }],
};

const state: PoiState = {
  info: { equips: {
    "1": { api_id: 1, api_slotitem_id: 10, api_level: 0, api_locked: 1 },
    "2": { api_id: 2, api_slotitem_id: 10, api_level: 0 },
    "3": { api_id: 3, api_slotitem_id: 10, api_level: 3 },
    "4": { api_id: 4, api_slotitem_id: 99, api_level: 0 },
  } },
  const: { $equips: {
    "10": { api_id: 10, api_name: "試製 砲", api_type: [0, 0, 1, 16] },
    "99": { api_id: 99, api_name: "未知装備" },
  }, $equipTypes: {
    "1": { api_id: 1, api_name: "小口径主砲" },
  } },
};

describe("inventory selectors", () => {
  it("waits until both inventory and master data exist", () => {
    expect(selectOwnedRecipes({}, db)).toEqual({ ready: false, items: [] });
  });

  it("groups instances and counts only level zero as materials", () => {
    const result = selectOwnedRecipes(state, db);
    expect(result.ready).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ id: 10, total: 3, materialCount: 2, levels: { 0: 2, 3: 1 } });
    expect(selectMaterialCounts(state).get(10)).toBe(2);
    expect(selectMaterialCounts(state).get(normalizeEquipmentName("試製 砲"))).toBe(2);
    expect(selectMaterialCounts(state).get(99)).toBe(1);
    expect(selectEquipmentIcons(state).get(10)).toBe(16);
    expect(selectEquipmentIcons(state).get(normalizeEquipmentName("試製 砲"))).toBe(16);
  });

  it("reflects inventory changes and ignores unknown equipment", () => {
    const changed = structuredClone(state);
    delete changed.info!.equips!["2"];
    expect(selectOwnedRecipes(changed, db).items[0].materialCount).toBe(1);
    expect(selectOwnedRecipes(changed, db).items.some((item) => item.id === 99)).toBe(false);
  });

  it("filters recipes by weekday", () => {
    expect(recipeAvailableOn(db.equipment[0], 1)).toBe(true);
    expect(recipeAvailableOn(db.equipment[0], 2)).toBe(false);
    expect(recipeAvailableOn(db.equipment[0], null)).toBe(true);
  });

  it("builds type filters from Poi equipment type masters", () => {
    const owned = selectOwnedRecipes(state, db).items;
    expect(selectEquipmentTypeOptions(owned)).toEqual([{ id: "test", name: "test", iconId: 16, row: 4 }]);
  });

  it("keeps improvement categories in the confirmed row order", () => {
    const owned = selectOwnedRecipes(state, db).items;
    const sample = owned[0];
    const items = ["陸上攻撃機", "副砲", "小口径主砲", "艦上戦闘機", "未知分類", "魚雷"].map((category, index) => ({
      ...sample,
      id: index + 1,
      type: [0, 0, index, 20 + index],
      recipe: { ...sample.recipe, category },
    }));
    expect(selectEquipmentTypeOptions(items).map((option) => [option.name, option.row, option.iconId])).toEqual([
      ["小口径主砲", 0, 22],
      ["副砲", 0, 21],
      ["艦上戦闘機", 1, 23],
      ["陸上攻撃機", 1, 20],
      ["魚雷", 2, 25],
      ["未知分類", 4, 24],
    ]);
  });

  it("prefers the current Poi name when a stored equipment ID is stale", () => {
    const conflicting: ImprovementDatabase = {
      ...db,
      equipment: [
        db.equipment[0],
        { ...db.equipment[0], equipmentId: 10, wikiName: "別の装備", normalizedName: normalizeEquipmentName("別の装備") },
      ],
    };
    expect(selectOwnedRecipes(state, conflicting).items[0].recipe.wikiName).toBe("試製 砲");
  });
});
