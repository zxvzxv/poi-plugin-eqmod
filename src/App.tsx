import React, { useMemo, useState } from "react";
import { Button, ButtonGroup, Collapse, NonIdealState, Spinner } from "@blueprintjs/core";
import { connect } from "react-redux";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEquipmentName, recipeAvailableOn, selectEquipmentIcons, selectEquipmentTypeOptions, selectMaterialCounts, selectOwnedRecipes } from "./selectors";
import type { EquipmentTypeOption, OwnedEquipment, PoiState, RecipeVariant, StageCost } from "./types";

type SlotitemIconComponent = React.ComponentType<{ slotitemId: number; className?: string; alt?: string }>;
type MaterialIconComponent = React.ComponentType<{ materialId: number; className?: string }>;

declare global {
  var i18n: {
    resources?: {
      __?: (name: string, ...args: unknown[]) => string;
    };
  } | undefined;
}

let PoiSlotitemIcon: SlotitemIconComponent | null = null;
let PoiMaterialIcon: MaterialIconComponent | null = null;
try {
  const icons = require("views/components/etc/icon") as {
    SlotitemIcon: SlotitemIconComponent;
    MaterialIcon: MaterialIconComponent;
  };
  PoiSlotitemIcon = icons.SlotitemIcon;
  PoiMaterialIcon = icons.MaterialIcon;
} catch {
  // The component is supplied by Poi at runtime and is absent in standalone tests.
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
const STAGES = { "0-5": "★0 ～ ★6", "6-9": "★6 ～ ★MAX", max: "★MAX" } as const;
type StageName = keyof typeof STAGES;

function translateGameName(name: string): string {
  const translate = globalThis.i18n?.resources?.__;
  if (typeof translate !== "function") return name;
  try {
    const translated = translate(name);
    return typeof translated === "string" && translated.length > 0 ? translated : name;
  } catch {
    return name;
  }
}

function TypeIcon({ iconId }: { iconId: number | undefined }) {
  return (
    <span className="eqmod-type-icon-wrap" data-type-icon={iconId ?? ""}>
      {iconId != null && PoiSlotitemIcon
        ? <PoiSlotitemIcon slotitemId={iconId} className="eqmod-type-icon" alt="" />
        : <span className="eqmod-type-icon-placeholder" />}
    </span>
  );
}

function EquipmentTypeIcon({ item }: { item: OwnedEquipment }) {
  const iconId = item.type[3];
  return (
    <span
      className="eqmod-equipment-icon-wrap"
      title={item.recipe.category}
      data-slotitem-icon={iconId ?? ""}
    >
      {iconId != null && PoiSlotitemIcon
        ? <PoiSlotitemIcon slotitemId={iconId} className="eqmod-equipment-icon" />
        : <span className="eqmod-equipment-icon-placeholder" />}
    </span>
  );
}

function InlineEquipmentIcon({ iconId, label }: { iconId: number | undefined; label: string }) {
  if (iconId == null) return null;
  return (
    <span className="eqmod-inline-equipment-icon-wrap" title={label} data-inline-slotitem-icon={iconId}>
      {PoiSlotitemIcon
        ? <PoiSlotitemIcon slotitemId={iconId} className="eqmod-inline-equipment-icon" />
        : <span className="eqmod-inline-equipment-icon-placeholder" />}
    </span>
  );
}

function MaterialIcon({ materialId, label }: { materialId: number; label: string }) {
  return (
    <span className="eqmod-material-icon-wrap" title={label} data-material-icon={materialId}>
      {PoiMaterialIcon
        ? <PoiMaterialIcon materialId={materialId} className="eqmod-material-icon" />
        : <span className="eqmod-material-icon-placeholder" />}
    </span>
  );
}

function resolveEquipmentIcon(
  equipmentIcons: Map<number | string, number>,
  name: string,
): number | undefined {
  const normalizedName = normalizeEquipmentName(name);
  const direct = equipmentIcons.get(normalizedName);
  if (direct != null) return direct;

  // Wiki target names can append improvement levels or footnotes after the official name.
  let bestMatch = "";
  let iconId: number | undefined;
  equipmentIcons.forEach((candidateIcon, key) => {
    if (typeof key === "string" && key.length > bestMatch.length && normalizedName.startsWith(key)) {
      bestMatch = key;
      iconId = candidateIcon;
    }
  });
  return iconId;
}

interface StateProps {
  ready: boolean;
  items: OwnedEquipment[];
  materialCounts: Map<number | string, number>;
  equipmentIcons: Map<number | string, number>;
  equipmentTypes: EquipmentTypeOption[];
}

function CostPair({ value }: { value: string }) {
  const [normal, guaranteed] = value.split("/");
  return <span>{normal}{guaranteed == null ? "" : `（${guaranteed}）`}</span>;
}

function parseMaterials(value: string): Array<{ name: string; count: number; special: boolean }> {
  if (!value || value === "なし") return [];
  return [...value.matchAll(/(.+?)x(\d+)(?:\s+|$)/g)].map((match) => ({
    name: match[1].trim(),
    count: Number(match[2]),
    special: /資材|詳報|熟練搭乗員|航空兵装/.test(match[1]),
  }));
}

function maskDays(mask: string): string {
  if (mask === "1111111") return "每天";
  return [...mask].flatMap((available, day) => available === "1" ? [WEEKDAYS[day].slice(2)] : []).join("、");
}

function RecipeStageRow({ update, stage, value, inventory, equipmentIcons }: {
  update: string;
  stage: StageName;
  value: StageCost;
  inventory: Map<number | string, number>;
  equipmentIcons: Map<number | string, number>;
}) {
  const materials = parseMaterials(value[2]);
  return (
    <div className="eqmod-stage-row" data-testid="recipe-stage">
      <div className={`eqmod-stage ${stage === "max" ? "eqmod-stage-upgrade" : ""}`}>
        {stage !== "max" ? STAGES[stage] : update !== "更新不可" ? <>
          <InlineEquipmentIcon
            iconId={resolveEquipmentIcon(equipmentIcons, update)}
            label={update}
          />
          {update}
        </> : update}
      </div>
      <div className="eqmod-cost"><CostPair value={value[0]} /></div>
      <div className="eqmod-cost"><CostPair value={value[1]} /></div>
      <div className="eqmod-materials">
        {materials.length === 0 && <span className="eqmod-muted">无需消费装备</span>}
        {materials.map((material, index) => {
          const available = material.special ? null : (inventory.get(normalizeEquipmentName(material.name)) ?? 0);
          const iconId = resolveEquipmentIcon(equipmentIcons, material.name);
          return <span className="eqmod-material-line" key={`${material.name}-${index}`}>
            {material.count} × <InlineEquipmentIcon iconId={iconId} label={material.name} />
            {material.name}{available == null ? "" : `（持有: ${available}）`}
          </span>;
        })}
      </div>
    </div>
  );
}

function RecipeVariantBlock({ variant, inventory, equipmentIcons }: {
  variant: RecipeVariant;
  inventory: Map<number | string, number>;
  equipmentIcons: Map<number | string, number>;
}) {
  const secretaries = Object.entries(variant.sub_ships);
  return <div className="eqmod-recipe-variant" data-testid="recipe-variant">
    <div className="eqmod-secretary">
      {secretaries.length === 0 && <strong>任意</strong>}
      {secretaries.map(([ship, mask]) => <span key={ship}><strong>{ship}</strong> {maskDays(mask)}</span>)}
    </div>
    <div className="eqmod-stage-rows">
      {(["0-5", "6-9", "max"] as const).flatMap((stage) => {
        const value = variant.stages[stage];
        return value ? [<RecipeStageRow key={stage} update={variant.stages.update} stage={stage} value={value} inventory={inventory} equipmentIcons={equipmentIcons} />] : [];
      })}
    </div>
  </div>;
}

function EquipmentPanel({ item, open, onToggle, weekday, inventory, equipmentIcons }: {
  item: OwnedEquipment; open: boolean; onToggle: () => void; weekday: number | null;
  inventory: Map<number | string, number>; equipmentIcons: Map<number | string, number>;
}) {
  const variants = item.recipe.variants
    .filter((variant) => weekday == null || Object.values(variant.sub_ships).length === 0 || Object.values(variant.sub_ships).some((mask) => mask[weekday] === "1"));
  const resources = item.recipe.res;
  const levels = Object.entries(item.levels).sort(([a], [b]) => Number(a) - Number(b));
  return (
    <section className={`eqmod-equipment ${open ? "is-open" : ""}`}>
      <button type="button" className="eqmod-equipment-header" onClick={onToggle} aria-expanded={open}>
        <span className="eqmod-chevron">{open ? "▾" : "▸"}</span>
        <span className="eqmod-equipment-name">
          <EquipmentTypeIcon item={item} />
          <strong>{item.name}</strong>
        </span>
        <span className="eqmod-levels" aria-label="持有星级分布">
          {levels.map(([level, count]) => <span key={level}>★{level === "10" ? "MAX" : level} × {count}</span>)}
        </span>
        <span className="eqmod-total">共 {item.total}</span>
      </button>
      <Collapse isOpen={open} keepChildrenMounted={false}>
        <div className="eqmod-recipe-head">
          <span>二番舰 / 星期</span>
          <div className="eqmod-resources" aria-label="资源消耗">
            <span className="fuel"><MaterialIcon materialId={1} label="燃" /> {resources[0]}</span>
            <span className="ammo"><MaterialIcon materialId={2} label="弹" /> {resources[1]}</span>
            <span className="steel"><MaterialIcon materialId={3} label="钢" /> {resources[2]}</span>
            <span className="bauxite"><MaterialIcon materialId={4} label="铝" /> {resources[3]}</span>
          </div>
          <span><MaterialIcon materialId={7} label="开发资材" /></span>
          <span><MaterialIcon materialId={8} label="改修资材" /></span>
          <span>消费装备</span>
        </div>
        {variants.map((variant, variantIndex) => <RecipeVariantBlock key={variantIndex} variant={variant} inventory={inventory} equipmentIcons={equipmentIcons} />)}
      </Collapse>
    </section>
  );
}

export function EqmodApp({ ready, items, materialCounts, equipmentIcons, equipmentTypes = [] }: StateProps) {
  const [weekday, setWeekday] = useState<number | null>(() => new Date().getDay());
  const [equipmentType, setEquipmentType] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const activeType = equipmentTypes.some((type) => type.id === equipmentType) ? equipmentType : null;
  const typeRows = useMemo(() => {
    const rows: EquipmentTypeOption[][] = [];
    equipmentTypes.forEach((type) => {
      const row = rows[type.row] ?? [];
      row.push(type);
      rows[type.row] = row;
    });
    if (equipmentTypes.length > 0) rows[0] ??= [];
    return rows.filter((row) => row.length > 0 || row === rows[0]);
  }, [equipmentTypes]);
  const visible = useMemo(
    () => items.filter((item) => (activeType == null || item.recipe.category === activeType) && recipeAvailableOn(item.recipe, weekday)),
    [items, weekday, activeType],
  );
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const emptyTitle = items.length === 0 ? "没有可显示的装备" : activeType == null ? "当天没有可改修装备" : "没有符合筛选的装备";
  const emptyDescription = items.length === 0
    ? "持有的装备中没有已收录的改修配方。"
    : activeType == null ? "可切换星期或查看全部装备。" : "可切换星期、类型，或查看全部。";

  const stylesheet = <link rel="stylesheet" href={pathToFileURL(join(__dirname, "style.css")).href} />;
  if (!ready) return <main className="poi-plugin-eqmod">{stylesheet}<NonIdealState icon={<Spinner size={32} />} title="等待游戏数据" description="登录游戏并等待装备主数据加载完成。" /></main>;
  return (
    <main className="poi-plugin-eqmod bp5-dark">
      {stylesheet}
      <div className="eqmod-toolbar">
        {equipmentTypes.length > 0 && <nav className="eqmod-types" aria-label="装备类型筛选">
          {typeRows.map((row, index) => <div className="eqmod-type-row" key={row[0]?.id ?? "guns"}>
            {index === 0 && <button type="button" className={`eqmod-type-all${activeType == null ? " is-active" : ""}`} aria-pressed={activeType == null} onClick={() => setEquipmentType(null)}>全部类型</button>}
            {row.map((type) => <button
              key={type.id}
              type="button"
              className={`eqmod-type-button${activeType === type.id ? " is-active" : ""}`}
              aria-pressed={activeType === type.id}
              onClick={() => setEquipmentType((current) => current === type.id ? null : type.id)}
            ><TypeIcon iconId={type.iconId} /><span className="eqmod-type-name">{translateGameName(type.name)}</span></button>)}
          </div>)}
        </nav>}
        <nav className="eqmod-weekdays" aria-label="星期筛选">
          <ButtonGroup minimal>
            {WEEKDAYS.map((label, day) => <Button key={label} active={weekday === day} onClick={() => setWeekday(day)}>{label}</Button>)}
            <Button active={weekday == null} onClick={() => setWeekday(null)}>全部装备</Button>
          </ButtonGroup>
        </nav>
      </div>
      <div className="eqmod-list">
        {visible.map((item) => <EquipmentPanel key={item.id} item={item} open={expanded.has(item.id)} onToggle={() => toggle(item.id)} weekday={weekday} inventory={materialCounts} equipmentIcons={equipmentIcons} />)}
        {visible.length === 0 && <NonIdealState icon="search" title={emptyTitle} description={emptyDescription} />}
      </div>
    </main>
  );
}

const mapState = (state: PoiState): StateProps => {
  const owned = selectOwnedRecipes(state);
  return {
    ...owned,
    materialCounts: selectMaterialCounts(state),
    equipmentIcons: selectEquipmentIcons(state),
    equipmentTypes: selectEquipmentTypeOptions(owned.items),
  };
};
export default connect(mapState)(EqmodApp);
