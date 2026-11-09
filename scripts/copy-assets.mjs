import { copyFile, mkdir } from "node:fs/promises";
await mkdir("dist/data", { recursive: true });
await copyFile("src/style.css", "dist/style.css");
await copyFile("src/data/improvements.json", "dist/data/improvements.json");
