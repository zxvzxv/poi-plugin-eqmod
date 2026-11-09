import React, { useMemo, useState } from "react";
import { Button, ButtonGroup, Collapse, NonIdealState, Spinner } from "@blueprintjs/core";
import { connect } from "react-redux";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeEquipmentName, recipeAvailableOn, selectEquipmentIcons, selectMaterialCounts, selectOwnedRecipes } from "./selectors";
import type { OwnedEquipment, PoiState, RecipeVariant } from "./types";

type SlotitemIconComponent = React.ComponentType<{ slotitemId: number; className?: string }>;
type MaterialIconComponent = React.ComponentType<{ materialId: number; className?: string }>;
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
const STAGES: Record<Exclude<RecipeVariant["stage"], "upgrade">, string> = { "0-5": "★0 ～ ★6", "6-9": "★6 ～ ★MAX" };
const STAGE_ORDER: Record<RecipeVariant["stage"], number> = { "0-5": 0, "6-9": 1, upgrade: 2 };

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
  equipmentId: number | undefined,
  name: string,
): number | undefined {
  const normalizedName = normalizeEquipmentName(name);
  const direct = equipmentIcons.get(equipmentId ?? normalizedName) ?? equipmentIcons.get(normalizedName);
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
}

function CostPair({ value }: { value: { normal: number; guaranteed: number | null } }) {
  return <span>{value.normal}{value.guaranteed == null ? "" : `（${value.guaranteed}）`}</span>;
}

function RecipeRow({ variant, inventory, equipmentIcons }: {
  variant: RecipeVariant;
  inventory: Map<number | string, number>;
  equipmentIcons: Map<number | string, number>;
}) {
  const days = variant.weekdays.length === 7 || variant.weekdays.length === 0
    ? "每天"
    : variant.weekdays.map((day) => WEEKDAYS[day].slice(2)).join("、");
  return (
    <div className="eqmod-recipe-row" data-testid="recipe-variant">
      <div className="eqmod-secretary">
        <strong>{variant.secretary.length ? variant.secretary.join(" / ") : "任意"}</strong>
        <span>{days}{variant.weekdayConditional ? "（条件）" : ""}</span>
      </div>
      <div className={`eqmod-stage ${variant.stage === "upgrade" ? "eqmod-stage-upgrade" : ""}`}>
        {variant.stage === "upgrade" && variant.upgradeTo ? <>
          <InlineEquipmentIcon
            iconId={resolveEquipmentIcon(equipmentIcons, variant.upgradeTo.equipmentId, variant.upgradeTo.name)}
            label={variant.upgradeTo.name}
          />
          {variant.upgradeTo.name}
        </> : variant.stage === "upgrade" ? "更新不可" : STAGES[variant.stage]}
      </div>
      <div className="eqmod-cost"><CostPair value={variant.development} /></div>
      <div className="eqmod-cost"><CostPair value={variant.improvement} /></div>
      <div className="eqmod-materials">
        {variant.materials.length === 0 && <span className="eqmod-muted">无需消费装备</span>}
        {variant.materials.map((material, index) => {
          const available = material.special ? null : (inventory.get(material.equipmentId ?? normalizeEquipmentName(material.name)) ?? 0);
          const iconId = resolveEquipmentIcon(equipmentIcons, material.equipmentId, material.name);
          return <span className="eqmod-material-line" key={`${material.name}-${index}`}>
            {material.count} × <InlineEquipmentIcon iconId={iconId} label={material.name} />
            {material.name}{available == null ? "" : `（持有: ${available}）`}
          </span>;
        })}
        {variant.notes.map((note, index) => <small key={index}>{note}</small>)}
      </div>
    </div>
  );
}

function EquipmentPanel({ item, open, onToggle, weekday, inventory, equipmentIcons }: {
  item: OwnedEquipment; open: boolean; onToggle: () => void; weekday: number | null;
  inventory: Map<number | string, number>; equipmentIcons: Map<number | string, number>;
}) {
  const variants = item.recipe.variants
    .filter((variant) => weekday == null || variant.weekdays.length === 0 || variant.weekdays.includes(weekday as 0 | 1 | 2 | 3 | 4 | 5 | 6))
    .sort((left, right) => STAGE_ORDER[left.stage] - STAGE_ORDER[right.stage]);
  const resources = variants[0]?.resources;
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
            <span className="fuel"><MaterialIcon materialId={1} label="燃" /> {resources?.fuel ?? 0}</span>
            <span className="ammo"><MaterialIcon materialId={2} label="弹" /> {resources?.ammo ?? 0}</span>
            <span className="steel"><MaterialIcon materialId={3} label="钢" /> {resources?.steel ?? 0}</span>
            <span className="bauxite"><MaterialIcon materialId={4} label="铝" /> {resources?.bauxite ?? 0}</span>
          </div>
          <span><MaterialIcon materialId={7} label="开发资材" /></span>
          <span><MaterialIcon materialId={8} label="改修资材" /></span>
          <span>消费装备</span>
        </div>
        {variants.map((variant) => <RecipeRow key={variant.id} variant={variant} inventory={inventory} equipmentIcons={equipmentIcons} />)}
      </Collapse>
    </section>
  );
}

export function EqmodApp({ ready, items, materialCounts, equipmentIcons }: StateProps) {
  const [weekday, setWeekday] = useState<number | null>(() => new Date().getDay());
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());
  const visible = useMemo(() => items.filter((item) => recipeAvailableOn(item.recipe, weekday)), [items, weekday]);
  const toggle = (id: number) => setExpanded((current) => {
    const next = new Set(current);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const stylesheet = <link rel="stylesheet" href={pathToFileURL(join(__dirname, "style.css")).href} />;
  if (!ready) return <main className="poi-plugin-eqmod">{stylesheet}<NonIdealState icon={<Spinner size={32} />} title="等待游戏数据" description="登录游戏并等待装备主数据加载完成。" /></main>;
  return (
    <main className="poi-plugin-eqmod bp5-dark">
      {stylesheet}
      <nav className="eqmod-weekdays" aria-label="星期筛选">
        <ButtonGroup minimal>
          {WEEKDAYS.map((label, day) => <Button key={label} active={weekday === day} onClick={() => setWeekday(day)}>{label}</Button>)}
          <Button active={weekday == null} onClick={() => setWeekday(null)}>全部装备</Button>
        </ButtonGroup>
      </nav>
      <div className="eqmod-list">
        {visible.map((item) => <EquipmentPanel key={item.id} item={item} open={expanded.has(item.id)} onToggle={() => toggle(item.id)} weekday={weekday} inventory={materialCounts} equipmentIcons={equipmentIcons} />)}
        {visible.length === 0 && <NonIdealState icon="search" title={items.length ? "当天没有可改修装备" : "没有可显示的装备"} description={items.length ? "可切换星期或查看全部装备。" : "持有的装备中没有已收录的改修配方。"} />}
      </div>
    </main>
  );
}

const mapState = (state: PoiState): StateProps => ({
  ...selectOwnedRecipes(state),
  materialCounts: selectMaterialCounts(state),
  equipmentIcons: selectEquipmentIcons(state),
});
export default connect(mapState)(EqmodApp);
