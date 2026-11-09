import databaseJson from "./data/improvements.json";
import type { EquipmentRecipe, EquipmentTypeOption, ImprovementDatabase, OwnedEquipment, PoiState, SlotItemInstance } from "./types";

export const database = databaseJson as ImprovementDatabase;

export function normalizeEquipmentName(name: string): string {
  return name.normalize("NFKC").replace(/[\s・･]/g, "").replace(/[（）]/g, (c) => c === "（" ? "(" : ")").toLowerCase();
}

export function selectOwnedRecipes(
  state: PoiState,
  db: ImprovementDatabase = database,
): { ready: boolean; items: OwnedEquipment[] } {
  const instances = state.info?.equips;
  const masters = state.const?.$equips;
  if (!instances || !masters) return { ready: false, items: [] };

  const recipesByName = new Map(db.equipment.map((x) => [x.normalizedName, x]));
  const grouped = new Map<number, SlotItemInstance[]>();
  Object.values(instances).forEach((item) => {
    const group = grouped.get(item.api_slotitem_id) ?? [];
    group.push(item);
    grouped.set(item.api_slotitem_id, group);
  });

  const items: OwnedEquipment[] = [];
  grouped.forEach((owned, id) => {
    const master = masters[String(id)];
    if (!master) return;
    // Poi's current official name is authoritative when matching the wiki snapshot.
    const recipe = recipesByName.get(normalizeEquipmentName(master.api_name));
    if (!recipe) return;
    const levels: Record<number, number> = {};
    owned.forEach(({ api_level = 0 }) => { levels[api_level] = (levels[api_level] ?? 0) + 1; });
    items.push({
      id,
      name: master.api_name,
      type: master.api_type ?? [],
      total: owned.length,
      levels,
      materialCount: levels[0] ?? 0,
      recipe,
    });
  });
  items.sort((a, b) => a.id - b.id);
  return { ready: true, items };
}

export function recipeAvailableOn(recipe: EquipmentRecipe, weekday: number | null): boolean {
  if (weekday == null) return true;
  return recipe.variants.some((variant) => {
    const masks = Object.values(variant.sub_ships);
    return masks.length === 0 || masks.some((mask) => mask[weekday] === "1");
  });
}

export function materialInventory(items: OwnedEquipment[]): Map<number | string, number> {
  return new Map(items.map((item) => [item.id, item.materialCount]));
}

export function selectMaterialCounts(state: PoiState): Map<number | string, number> {
  const counts = new Map<number | string, number>();
  const masters = state.const?.$equips ?? {};
  Object.values(state.info?.equips ?? {}).forEach((item) => {
    if ((item.api_level ?? 0) === 0) {
      counts.set(item.api_slotitem_id, (counts.get(item.api_slotitem_id) ?? 0) + 1);
      const name = masters[String(item.api_slotitem_id)]?.api_name;
      if (name) {
        const normalized = normalizeEquipmentName(name);
        counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
      }
    }
  });
  return counts;
}

export function selectEquipmentIcons(state: PoiState): Map<number | string, number> {
  const icons = new Map<number | string, number>();
  Object.values(state.const?.$equips ?? {}).forEach((master) => {
    const iconId = master.api_type?.[3];
    if (iconId == null) return;
    icons.set(master.api_id, iconId);
    icons.set(normalizeEquipmentName(master.api_name), iconId);
  });
  return icons;
}

export const EQUIPMENT_CATEGORY_ROWS = [
  ["小口径主砲", "中口径主砲", "大口径主砲", "副砲"],
  ["艦上戦闘機", "艦上爆撃機", "艦上攻撃機", "艦上偵察機", "水上戦闘機", "水上偵察機", "水上爆撃機", "対潜哨戒機", "回転翼機", "局地戦闘機", "陸軍戦闘機", "陸上攻撃機"],
  ["魚雷", "爆雷", "ソナー", "電探", "対空機銃", "対空強化弾", "対艦強化弾", "高射装置", "探照灯", "発煙装置"],
  ["増設バルジ", "機関部強化", "航空要員", "熟練見張員", "戦闘糧食", "上陸用舟艇・特型内火艇", "潜水艦装備", "対地装備", "司令部施設"],
] as const;

const categoryPlacement = new Map<string, { row: number; index: number }>(EQUIPMENT_CATEGORY_ROWS.flatMap((row, rowIndex) => row.map((name, index) => [name, { row: rowIndex, index }])));

export function selectEquipmentTypeOptions(items: OwnedEquipment[]): EquipmentTypeOption[] {
  const grouped = new Map<string, OwnedEquipment[]>();
  items.forEach((item) => {
    const category = item.recipe.category;
    if (!category) return;
    const group = grouped.get(category) ?? [];
    group.push(item);
    grouped.set(category, group);
  });

  const options: EquipmentTypeOption[] = [];
  grouped.forEach((owned, category) => {
    const placement = categoryPlacement.get(category) ?? { row: EQUIPMENT_CATEGORY_ROWS.length, index: Number.MAX_SAFE_INTEGER };
    const representative = owned.filter((item) => item.type[3] != null).sort((left, right) => left.id - right.id)[0];
    options.push({ id: category, name: category, iconId: representative?.type[3], row: placement.row });
  });
  options.sort((left, right) => {
    const leftPlace = categoryPlacement.get(left.id) ?? { row: left.row, index: Number.MAX_SAFE_INTEGER };
    const rightPlace = categoryPlacement.get(right.id) ?? { row: right.row, index: Number.MAX_SAFE_INTEGER };
    return leftPlace.row - rightPlace.row || leftPlace.index - rightPlace.index || left.name.localeCompare(right.name, "ja");
  });
  return options;
}
