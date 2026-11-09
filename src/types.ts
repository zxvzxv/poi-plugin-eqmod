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

export interface EquipTypeMaster {
  api_id: number;
  api_name: string;
}

export interface PoiState {
  info?: { equips?: Record<string, SlotItemInstance> };
  const?: {
    $equips?: Record<string, EquipmentMaster>;
    $equipTypes?: Record<string, EquipTypeMaster>;
  };
}

export type StageCost = [development: string, improvement: string, materials: string];

export interface RecipeVariant {
  sub_ships: Record<string, string>;
  stages: {
    "0-5"?: StageCost;
    "6-9"?: StageCost;
    max?: StageCost;
    update: string;
  };
}

export interface EquipmentRecipe {
  wikiName: string;
  normalizedName: string;
  category: string;
  res: [fuel: number, ammo: number, steel: number, bauxite: number];
  variants: RecipeVariant[];
}

export interface ImprovementDatabase {
  equipment: EquipmentRecipe[];
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

export interface EquipmentTypeOption {
  id: string;
  name: string;
  iconId?: number;
  row: number;
}
