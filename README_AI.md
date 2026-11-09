# poi-plugin-eqmod

Poi 12.0.1 的离线装备改修查看插件。插件按改修分类和星期展示当前账号实际持有且已收录改修配方的装备，并列出持有星级、资源、资材、担当舰、消费装备、特殊道具与更新目标。分类按钮使用改修数据中的类别，图标使用 Poi 装备图标。

## 环境与构建

默认Windows环境进行开发，其他环境自行替代同类指令

需要 Node.js 22.18 或更新版本以及 npm。PowerShell 执行策略禁止 `npm.ps1` 时请使用 `npm.cmd`。

```powershell
npm.cmd install
npm.cmd run verify
```

构建产物位于 `dist`，入口为 `dist/index.js`。React、React Redux 和 Blueprint 由 Poi 宿主提供，发布包不会包含这些运行时依赖。

## 本地安装

先构建，再链接到 Poi 插件目录：

```powershell
npm.cmd link
npm.cmd link --prefix "$env:APPDATA\poi\plugins" poi-plugin-eqmod
```

重启 Poi 后可在插件页签或分离窗口打开“装备改修”。库存来自 Poi Redux，会随游戏数据自动刷新；插件运行时不访问网络或写本地文件。

## 更新改修数据

默认命令通过本机 HTTP 代理 `127.0.0.1:10808` 访问 wikiwiki：

```powershell
npm.cmd run data:update
```

也可直接指定代理或依赖 `HTTPS_PROXY`：

```powershell
node scripts/fetch-wiki.mjs --proxy http://127.0.0.1:10808
```

抓取器会检查 HTTP 状态、页面标志、表格结构、装备数量、阶段枚举与重复锚点，打印新增/删除/变化/未匹配摘要。全部解析与校验通过后才原子替换 `src/data/improvements.json`。装备通过 NFKC 规范化后的 wiki 名称与 `data/equipment-master.json` 中的 Poi `api_name` 关联；锚点只作为审查提示。

更新完成后运行 `npm.cmd run verify`。构建会将数据库与限定在 `.poi-plugin-eqmod` 下的样式复制到 `dist`。

尽量减少访问次数，避免重复访问网站获取数据增加wikiwiki服务器压力

## 数据与隐私

`api.env` 被明确忽略且不应提交。本插件不保存库存；所有材料数量均实时统计 Redux 中 `api_level === 0` 的实例，锁定或已装备实例仍计入，任何已有改修等级的实例均不计入。
