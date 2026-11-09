import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EqmodApp } from "./App";
import type { EquipmentTypeOption, OwnedEquipment } from "./types";

const item: OwnedEquipment = {
  id: 1, name: "12.7cm連装砲", type: [0, 0, 1, 16], total: 2, levels: { 0: 1, 4: 1 }, materialCount: 1,
  recipe: {
    equipmentId: 1, wikiName: "12.7cm連装砲", normalizedName: "12.7cm連装砲", category: "主砲",
    variants: [
      { id: "tuesday", stage: "upgrade", resources: { fuel: 10, ammo: 20, steel: 30, bauxite: 0 }, development: { normal: 2, guaranteed: 3 }, improvement: { normal: 3, guaranteed: 4 }, weekdays: [2], secretary: ["綾波"], materials: [{ equipmentId: 1, name: "12.7cm連装砲", count: 1 }], upgradeTo: { equipmentId: 2, name: "12.7cm連装砲B型改二" }, notes: [], sourceText: [] },
      { id: "monday", stage: "0-5", resources: { fuel: 10, ammo: 20, steel: 30, bauxite: 0 }, development: { normal: 1, guaranteed: 2 }, improvement: { normal: 2, guaranteed: 3 }, weekdays: [1], secretary: ["吹雪"], materials: [], notes: [], sourceText: [] },
      { id: "wednesday", stage: "6-9", resources: { fuel: 10, ammo: 20, steel: 30, bauxite: 0 }, development: { normal: 2, guaranteed: 3 }, improvement: { normal: 3, guaranteed: 4 }, weekdays: [3], secretary: ["夕立"], materials: [], notes: [], sourceText: [] },
    ],
  },
};

const plane: OwnedEquipment = {
  ...item,
  id: 20,
  name: "零式艦戦21型",
  type: [0, 0, 6, 6],
  recipe: { ...item.recipe, equipmentId: 20, wikiName: "零式艦戦21型", category: "艦上戦闘機", variants: item.recipe.variants.map((variant) => ({ ...variant, id: `plane-${variant.id}` })) },
};

const equipmentTypes: EquipmentTypeOption[] = [
  { id: "小口径主砲", name: "小口径主砲", iconId: 16, row: 0 },
  { id: "艦上戦闘機", name: "艦上戦闘機", iconId: 6, row: 1 },
];

describe("EqmodApp", () => {
  const equipmentIcons = new Map<number | string, number>([[1, 16], [2, 1]]);

  it("shows a waiting state before Redux data is ready", () => {
    render(<EqmodApp ready={false} items={[]} materialCounts={new Map()} equipmentIcons={new Map()} />);
    expect(screen.getByText("等待游戏数据")).toBeInTheDocument();
  });

  it("shows an empty inventory state", () => {
    render(<EqmodApp ready items={[]} materialCounts={new Map()} equipmentIcons={new Map()} />);
    expect(screen.getByText("没有可显示的装备")).toBeInTheDocument();
  });

  it("filters by day, expands rows, and shows all branches", () => {
    render(<EqmodApp ready items={[item]} materialCounts={new Map([[1, 1]])} equipmentIcons={equipmentIcons} />);
    fireEvent.click(screen.getByRole("button", { name: "星期一" }));
    expect(screen.getByTitle("主砲")).toHaveAttribute("data-slotitem-icon", "16");
    fireEvent.click(screen.getByRole("button", { name: /12.7cm連装砲/ }));
    expect(screen.getByText("吹雪")).toBeInTheDocument();
    expect(screen.queryByText("綾波")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部装备" }));
    expect(screen.getByText("吹雪")).toBeInTheDocument();
    expect(screen.getByText("綾波")).toBeInTheDocument();
    expect(screen.getByText("12.7cm連装砲B型改二")).toBeInTheDocument();
    expect(screen.getByTitle("12.7cm連装砲B型改二")).toHaveAttribute("data-inline-slotitem-icon", "1");
    expect(screen.getByTitle("12.7cm連装砲")).toHaveAttribute("data-inline-slotitem-icon", "16");
    expect(screen.getByText(/持有: 1/)).toBeInTheDocument();
    expect(screen.getAllByLabelText("资源消耗")).toHaveLength(1);
    const resourceCosts = screen.getByLabelText("资源消耗");
    expect(resourceCosts).toHaveTextContent("10 20 30 0");
    expect(screen.getByTitle("燃")).toHaveAttribute("data-material-icon", "1");
    expect(screen.getByTitle("开发资材")).toHaveAttribute("data-material-icon", "7");
    expect(screen.getByTitle("改修资材")).toHaveAttribute("data-material-icon", "8");
    expect(screen.getAllByTestId("recipe-variant").map((row) => row.textContent)).toEqual([
      expect.stringContaining("★0 ～ ★6"),
      expect.stringContaining("★6 ～ ★MAX"),
      expect.stringContaining("12.7cm連装砲B型改二"),
    ]);
  });

  it("filters owned equipment by improvement category rows", () => {
    const gun = { ...item, recipe: { ...item.recipe, category: "小口径主砲" } };
    render(<EqmodApp ready items={[gun, plane]} materialCounts={new Map()} equipmentIcons={equipmentIcons} equipmentTypes={equipmentTypes} />);
    fireEvent.click(screen.getByRole("button", { name: "全部装备" }));
    const gunType = screen.getByRole("button", { name: "小口径主砲" });
    const planeType = screen.getByRole("button", { name: "艦上戦闘機" });
    expect(gunType.querySelector("[data-type-icon]")).toHaveAttribute("data-type-icon", "16");
    expect(gunType.textContent).toBe("小口径主砲");
    expect(planeType.textContent).toBe("艦上戦闘機");
    expect(gunType.closest(".eqmod-type-row")).not.toBe(planeType.closest(".eqmod-type-row"));
    fireEvent.click(gunType);
    expect(screen.getByRole("button", { name: /12.7cm連装砲/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /零式艦戦21型/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "全部类型" }));
    expect(screen.getByRole("button", { name: /零式艦戦21型/ })).toBeInTheDocument();
  });
});
