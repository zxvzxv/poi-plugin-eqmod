export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface SlotItemInstance {
  api_id: number;
  api_slotitem_id: number;
  api_level: number;
  api_locked?: number;
}

export interface EquipmentMaster {
  api_id: number;
  api_name: string;
  api_type?: number[];
}

export interface PoiState {
  info?: { equips?: Record<string, SlotItemInstance> };
  const?: { $equips?: Record<string, EquipmentMaster> };
}

export interface MaterialCost {
  equipmentId?: number;
  name: string;
  count: number;
  special?: boolean;
}

export interface ResourceCost {
  fuel: number;
  ammo: number;
  steel: number;
  bauxite: number;
}

export interface RecipeVariant {
  id: string;
  stage: "0-5" | "6-9" | "upgrade";
  resources: ResourceCost;
  development: { normal: number; guaranteed: number | null };
  improvement: { normal: number; guaranteed: number | null };
  weekdays: Weekday[];
  weekdayConditional?: boolean;
  secretary: string[];
  materials: MaterialCost[];
  upgradeTo?: { equipmentId?: number; name: string };
  notes: string[];
  sourceText: string[];
}

export interface EquipmentRecipe {
  equipmentId?: number;
  wikiName: string;
  normalizedName: string;
  anchor?: string;
  category: string;
  variants: RecipeVariant[];
}

export interface ImprovementDatabase {
  schemaVersion: 1;
  source: { url: string; pageUpdatedAt: string | null; etag: string | null; sha256: string };
  generatedAt: string;
  categories: string[];
  equipment: EquipmentRecipe[];
  unmatched: string[];
}

export interface OwnedEquipment {
  id: number;
  name: string;
  type: number[];
  total: number;
  levels: Record<number, number>;
  materialCount: number;
  recipe: EquipmentRecipe;
}
