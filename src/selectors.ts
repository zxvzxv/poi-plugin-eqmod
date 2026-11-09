import databaseJson from "./data/improvements.json";
import type { EquipmentRecipe, ImprovementDatabase, OwnedEquipment, PoiState, SlotItemInstance } from "./types";

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

  const recipesById = new Map(db.equipment.filter((x) => x.equipmentId != null).map((x) => [x.equipmentId!, x]));
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
    // Wiki anchors and stale ID snapshots can be wrong; Poi's current official name is authoritative.
    const recipe = recipesByName.get(normalizeEquipmentName(master.api_name)) ?? recipesById.get(id);
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
  return recipe.variants.some((variant) => variant.weekdays.length === 0 || variant.weekdays.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6));
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
