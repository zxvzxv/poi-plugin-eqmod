import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { validateDatabase } from "./lib/wiki-parser.mjs";

const file = resolve(process.argv[2] ?? "src/data/improvements.json");
const database = JSON.parse(await readFile(file, "utf8"));
validateDatabase(database);
console.log(`数据校验通过: ${database.equipment.length} 项装备，${database.equipment.reduce((sum, item) => sum + item.variants.length, 0)} 条配方`);
