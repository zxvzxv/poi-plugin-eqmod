import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EqmodApp } from "./App";
import type { EquipmentTypeOption, OwnedEquipment } from "./types";

const item: OwnedEquipment = {
  id: 1, name: "12.7cm連装砲", type: [0, 0, 1, 16], total: 2, levels: { 0: 1, 4: 1 }, materialCount: 1,
  recipe: {
    wikiName: "12.7cm連装砲", normalizedName: "12.7cm連装砲", category: "主砲", res: [10, 20, 30, 0],
    variants: [
      { sub_ships: { "吹雪": "0100000", "綾波": "0010000" }, stages: { "0-5": ["1/2", "2/3", "なし"], "6-9": ["2/3", "3/4", "12.7cm連装砲x1"], max: ["2/3", "3/4", "12.7cm連装砲x1"], update: "12.7cm連装砲B型改二" } },
      { sub_ships: { "夕立": "0001000" }, stages: { "0-5": ["1/2", "2/3", "なし"], update: "更新不可" } },
    ],
  },
};

const plane: OwnedEquipment = {
  ...item,
  id: 20,
  name: "零式艦戦21型",
  type: [0, 0, 6, 6],
  recipe: { ...item.recipe, wikiName: "零式艦戦21型", normalizedName: "零式艦戦21型", category: "艦上戦闘機" },
};

const equipmentTypes: EquipmentTypeOption[] = [
  { id: "小口径主砲", name: "小口径主砲", iconId: 16, row: 0 },
  { id: "艦上戦闘機", name: "艦上戦闘機", iconId: 6, row: 1 },
];

describe("EqmodApp", () => {
  const equipmentIcons = new Map<number | string, number>([["12.7cm連装砲", 16], ["12.7cm連装砲b型改二", 1]]);

  it("shows a waiting state before Redux data is ready", () => {
    render(<EqmodApp ready={false} items={[]} materialCounts={new Map()} equipmentIcons={new Map()} />);
    expect(screen.getByText("等待游戏数据")).toBeInTheDocument();
  });

  it("shows an empty inventory state", () => {
    render(<EqmodApp ready items={[]} materialCounts={new Map()} equipmentIcons={new Map()} />);
    expect(screen.getByText("没有可显示的装备")).toBeInTheDocument();
  });

  it("filters by day, expands rows, and shows all branches", () => {
    render(<EqmodApp ready items={[item]} materialCounts={new Map([["12.7cm連装砲", 1]])} equipmentIcons={equipmentIcons} />);
    fireEvent.click(screen.getByRole("button", { name: "星期一" }));
    expect(screen.getByTitle("主砲")).toHaveAttribute("data-slotitem-icon", "16");
    fireEvent.click(screen.getByRole("button", { name: /12.7cm連装砲/ }));
    expect(screen.getAllByText("吹雪")).toHaveLength(1);
    expect(screen.getAllByText("綾波")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "全部装备" }));
    expect(screen.getAllByText("吹雪")).toHaveLength(1);
    expect(screen.getAllByText("綾波")).toHaveLength(1);
    expect(screen.getByText((_text, element) => element?.classList.contains("eqmod-stage") === true && element.textContent?.includes("12.7cm連装砲B型改二") === true)).toBeInTheDocument();
    expect(screen.getByTitle("12.7cm連装砲B型改二")).toHaveAttribute("data-inline-slotitem-icon", "1");
    expect(screen.getAllByTitle("12.7cm連装砲")[0]).toHaveAttribute("data-inline-slotitem-icon", "16");
    expect(screen.getAllByText(/持有: 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText("资源消耗")).toHaveLength(1);
    const resourceCosts = screen.getByLabelText("资源消耗");
    expect(resourceCosts).toHaveTextContent("10 20 30 0");
    expect(screen.getByTitle("燃")).toHaveAttribute("data-material-icon", "1");
    expect(screen.getByTitle("开发资材")).toHaveAttribute("data-material-icon", "7");
    expect(screen.getByTitle("改修资材")).toHaveAttribute("data-material-icon", "8");
    expect(screen.getAllByTestId("recipe-variant")).toHaveLength(2);
    expect(screen.getAllByTestId("recipe-stage").map((row) => row.textContent)).toEqual([
      expect.stringContaining("★0 ～ ★6"),
      expect.stringContaining("★6 ～ ★MAX"),
      expect.stringMatching(/^12.7cm連装砲B型改二/),
      expect.stringContaining("★0 ～ ★6"),
    ]);
    expect(screen.queryByText(/★MAX\s*→/)).not.toBeInTheDocument();
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
