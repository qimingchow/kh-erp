# 坤禾半导体 ERP

这是坤禾半导体线上进销存系统的第一版可部署骨架，当前已包含账号登录、用户权限、来料录入、库存管理、Excel 导出，以及后续出库、生产、机台、财务模块的前端入口。

## 本地预览

推荐用 Node 服务启动，来料、库存和用户会保存到后端数据文件：

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:4173/
```

## 正式方案：NAS Docker 采集器

异地访问和线上部署时，不建议让线上服务器直接挂载 NAS SMB。正式方案是把采集器跑在 NAS Docker 里，采集器在 NAS 局域环境内读取原始 CSV，只通过 HTTPS 把文件索引、统计结果和异常日志上传到线上 ERP。

数据流：

```text
NAS 团队空间 CSV
  -> NAS Docker 采集器
  -> HTTPS /api/machine-data/ingest
  -> 线上 ERP 机台统计
```

这个方式不会把 40T 原始文件同步到服务器，服务器只保存结构化统计数据。

### 1. 线上 ERP 配置采集器密钥

在服务器启动 ERP 时增加一个长随机密钥：

```bash
cd /opt/kh-erp
nano .env
```

写入：

```bash
KH_ERP_COLLECTOR_TOKEN="换成一串很长的随机密钥"
```

`deploy.sh` 会自动读取 `/opt/kh-erp/.env`。服务端未配置这个变量时，会拒绝采集器上传。

### 2. NAS Docker 配置

采集器文件在 `collector/` 目录：

```text
collector/
  Dockerfile
  collector.js
  package.json
  docker-compose.example.yml
```

在 NAS Docker 管理界面里创建容器时：

- 镜像：用 `collector/Dockerfile` 构建，或把本目录上传到 NAS 后用 compose 构建。
- 挂载团队空间到 `/nas`。如果只做索引扫描可以只读；如果启用测试机班次汇总，需要读写权限，因为采集器会生成汇总表并把已统计 CSV 归档到批次文件夹。
- 挂载一个可写目录到 `/state`，用于保存已处理文件哈希和修改时间。

容器环境变量示例：

```bash
KH_ERP_API_BASE=https://你的线上ERP地址
KH_ERP_COLLECTOR_TOKEN=和服务器一致的长随机密钥
KH_ERP_NAS_ROOT=/nas
KH_ERP_COLLECTOR_ENABLED=true
KH_ERP_FILE_INDEX_ENABLED=true
KH_ERP_RUN_IMPORT_ENABLED=true
KH_ERP_TESTER_DIR=测试机
KH_ERP_TESTER_DATA_DIR=测试档
KH_ERP_SORTER_DIR=分选机
KH_ERP_SORTER_DATA_DIR=CN
KH_ERP_DAY_SHIFT_START=08:00
KH_ERP_NIGHT_SHIFT_START=20:00
KH_ERP_SCAN_INTERVAL_SECONDS=300
KH_ERP_LOOKBACK_HOURS=168
KH_ERP_MAX_FILES_PER_SCAN=500
KH_ERP_FILE_INDEX_LIMIT=5000
KH_ERP_TESTER_SUMMARY_ENABLED=true
KH_ERP_TESTER_SUMMARY_WINDOWS=08:00-12:00@12:05,12:00-20:00@20:05,20:00-00:00@00:05,00:00-08:00@08:05
KH_ERP_TESTER_SUMMARY_LOOKBACK_DAYS=2
KH_ERP_TESTER_SUMMARY_ARCHIVE_MODE=move
KH_ERP_TESTER_SUMMARY_OUTPUT_FORMAT=xlsx
KH_ERP_TESTER_SUMMARY_GROUP_FIELDS=Specification,Spec,料号,规格,型号
KH_ERP_TESTER_SUMMARY_QUANTITY_FIELDS=TotalTested,Total Tested,测试总数,总测试数
KH_ERP_TESTER_SUMMARY_QUANTITY_LABEL=TotalTested
KH_ERP_SORTER_SUMMARY_ENABLED=false
KH_ERP_SORTER_SUMMARY_GROUP_FIELDS=Specification,Spec,料号,规格,型号,PartNo,Lot
KH_ERP_SORTER_SUMMARY_QUANTITY_FIELDS=TotalSorted,TotalTested,OutputQty,产出数量,分选总数,总数
KH_ERP_SORTER_SUMMARY_QUANTITY_LABEL=TotalSorted
KH_ERP_SUMMARY_MAX_MACHINES_PER_RUN=0
KH_ERP_SUMMARY_MAX_FILES_PER_MACHINE=1000
KH_ERP_HISTORY_SUMMARY_ENABLED=false
KH_ERP_HISTORY_SUMMARY_TYPES=tester
KH_ERP_HISTORY_SUMMARY_FROM=
KH_ERP_HISTORY_SUMMARY_TO=
KH_ERP_HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN=2
KH_ERP_HISTORY_SUMMARY_REPROCESS=false
KH_ERP_DRY_RUN=false
```

容器内 `/nas` 下应能看到：

```text
/nas/
  测试机/
    测试档/
      P41/
        N22_AY-7-P41-0190.CSV
      P24/
        H9CLS7684A (L).CSV
  分选机/
    CN/
      S034/
        数据文件.csv
```

### 3. 扫描规则

- 默认每 5 分钟扫描一次。
- 默认只解析最近 168 小时内修改过的新文件或变更文件。
- 默认每轮最多解析 500 个文件，避免 NAS 忙时一次读太多大 CSV。
- 保存到 `/state` 的只是文件哈希、修改时间和状态，不保存原始 CSV。
- CSV/TSV/TXT 会尝试解析；Excel 原文件会进入异常/暂不支持状态。
- `KH_ERP_COLLECTOR_ENABLED=false` 可以临时暂停容器扫描，容器仍保持运行。
- `KH_ERP_FILE_INDEX_ENABLED=false` 可关闭文件列表上传；`KH_ERP_RUN_IMPORT_ENABLED=false` 可关闭运行记录解析。两者都关闭时，仍可单独跑本地班次汇总或历史补跑。
- 测试机 CSV 采用文件头里的 `TestTime` 判断归属时间段，采用 `Specification` 作为料号，汇总 `TotalTested`。
- 启用 `KH_ERP_TESTER_SUMMARY_ENABLED=true` 后，采集器会在到点后处理已完成时间窗。例如 `08:00-12:00@12:05` 会在 12:05 以后统计 08:00 到 12:00 的文件。
- 每台测试机会在本机台目录下生成一个时间窗文件夹，例如 `测试机/测试档/P24/202607081200/`，表示统计截止到 2026-07-08 12:00。
- 该时间窗内的源 CSV 会按 `KH_ERP_TESTER_SUMMARY_ARCHIVE_MODE` 归档：`move` 表示移动到时间窗文件夹，`copy` 表示复制保留原文件。
- 时间窗文件夹内会生成 `P24-202607081200-TotalTested-summary.xlsx`。表格格式与示例一致：第一行是各 `Specification`，第二行第一列是 `TotalTested`，后续列是对应料号的汇总数量。
- 分选机采用独立开关 `KH_ERP_SORTER_SUMMARY_ENABLED` 和独立字段别名，默认关闭。等确认分选机 CSV 字段后，只需要调整 `KH_ERP_SORTER_SUMMARY_GROUP_FIELDS` 和 `KH_ERP_SORTER_SUMMARY_QUANTITY_FIELDS`，不影响测试机。
- 资源保护可以用 `KH_ERP_SUMMARY_MAX_MACHINES_PER_RUN` 和 `KH_ERP_SUMMARY_MAX_FILES_PER_MACHINE` 控制每轮处理量。机台多、文件多时，建议先设较小值观察 NAS 负载。

### 4. 历史数据补跑

历史数据不要和实时汇总混在一起长期全量跑，推荐按日期范围分批补跑。补跑仍然按 `TestTime` 归属到同样的时间窗目录，例如历史文件落在 2026-07-01 08:00 到 12:00，就会进入 `202607011200`。

第一次补历史建议先 dry-run：

```bash
KH_ERP_ONCE=true
KH_ERP_DRY_RUN=true
KH_ERP_FILE_INDEX_ENABLED=false
KH_ERP_RUN_IMPORT_ENABLED=false
KH_ERP_TESTER_SUMMARY_ENABLED=false
KH_ERP_HISTORY_SUMMARY_ENABLED=true
KH_ERP_HISTORY_SUMMARY_TYPES=tester
KH_ERP_HISTORY_SUMMARY_FROM=2026-07-01
KH_ERP_HISTORY_SUMMARY_TO=2026-07-03
KH_ERP_HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN=2
```

确认 NAS 上生成的归档目录和汇总表没问题后，再把 `KH_ERP_DRY_RUN=false` 或扩大日期范围。`KH_ERP_HISTORY_SUMMARY_MAX_WINDOWS_PER_RUN` 用来限制每轮最多补几个时间窗，避免一次补很多天导致读盘压力过大。已补过的历史时间窗会记录在 `/state`，默认不会重复补；需要强制重跑时再设 `KH_ERP_HISTORY_SUMMARY_REPROCESS=true`。

如果要先跑一次测试，可以设置：

```bash
KH_ERP_ONCE=true
KH_ERP_DRY_RUN=true
```

`KH_ERP_DRY_RUN=true` 时不会上传线上 ERP，只会在 NAS 本地扫描、归档、生成汇总表并写入 `/state` 状态文件，适合第一次部署时验证目录和权限。

### 5. 页面使用方式

线上 ERP 的“机台统计”页面不再直接打开 NAS 文件夹。它会展示采集器上传的文件索引、班次统计、机台排行和异常日志。页面里的本机扫描和打开目录能力只保留给公司局域网内调试使用。

## 本地调试 NAS/SMB 机台数据

本地调试时，ERP 读取的是 Mac 上已经挂载好的本地目录。也就是说不要在 ERP 里直接填 `smb://...`，而是先把 SMB 挂载到 Mac 的某个目录，再把这个目录填到“机台统计”的 NAS 挂载路径。

ERP 读取时仍按下面这种结构识别：

```text
/Users/stephen/kh-erp-nas/
  测试机/
    测试档/
      p09/
        数据文件.csv
      p10/
        数据文件.csv
  分选机/
    CN/
      S034/
        数据文件.csv
      S038/
        数据文件.csv
```

你的 NAS 当前暴露的是两个独立 SMB 共享：`团队文件-测试机` 和 `团队文件-分选机`。本地脚本会把它们分别挂载到 `/Users/stephen/kh-erp-nas/测试机` 和 `/Users/stephen/kh-erp-nas/分选机`，ERP 里只需要填统一根目录 `/Users/stephen/kh-erp-nas`。

### 1. 创建本地 NAS 配置

配置文件放在 Mac 用户目录，不提交到 Git：

```bash
mkdir -p ~/.kh-erp
nano ~/.kh-erp/nas.local.env
```

示例内容：

```bash
NAS_SMB_HOST=192.168.0.233
NAS_SMB_USER=你的NAS账号
NAS_SMB_PASSWORD='你的NAS密码'
NAS_TESTER_SMB_SHARE=团队文件-测试机
NAS_SORTER_SMB_SHARE=团队文件-分选机
NAS_MOUNT_ROOT="$HOME/kh-erp-nas"
NAS_TESTER_DIR="测试机"
NAS_SORTER_DIR="分选机"
```

如果不确定 SMB 的“共享目录名”是什么，先执行：

```bash
./scripts/nas-macos.sh shares
```

注意：共享名里有中文，密码里也可能有特殊字符，所以推荐用上面这种拆分写法，脚本会自动编码后再交给 `mount_smbfs`。不要把整条 `//账号:密码@IP/共享名` 直接写进配置，除非你确认账号、密码、共享名都不需要 URL 编码。

保存后设置权限：

```bash
chmod 600 ~/.kh-erp/nas.local.env
```

### 2. 挂载 NAS

```bash
cd /Users/stephen/Documents/codexWorkspace
./scripts/nas-macos.sh mount
```

查看挂载状态和 ERP 应填写的路径：

```bash
./scripts/nas-macos.sh status
```

如果挂载超时，先跑诊断：

```bash
./scripts/nas-macos.sh doctor
```

输出里的 `ERP NAS path` 就是“机台统计”页面要填写的路径，例如：

```text
/Users/stephen/kh-erp-nas
```

此时还应该能看到两个大类目录：

```bash
ls /Users/stephen/kh-erp-nas
```

输出应包含：

```text
测试机
分选机
```

### 3. 长期自动挂载（推荐）

本地跑通后，可以安装一个 macOS 登录自动挂载任务。它会在登录时执行一次，并每 5 分钟检查一次挂载状态，避免每次手动输入命令。

```bash
cd /Users/stephen/Documents/codexWorkspace
./scripts/nas-launch-agent.sh install
```

查看自动挂载任务和日志：

```bash
./scripts/nas-launch-agent.sh status
./scripts/nas-macos.sh status
```

如果以后不想自动挂载：

```bash
./scripts/nas-launch-agent.sh uninstall
```

### 4. 启动本地 ERP

```bash
npm run dev
```

打开：

```text
http://127.0.0.1:4173/
```

登录管理员账号后进入“机台统计”，把 `ERP NAS path` 填到 NAS 挂载路径，保存配置，再点击“扫描 NAS 新文件”。

推荐配置：

```text
NAS 团队空间路径：/Users/stephen/kh-erp-nas
测试机大类文件夹：测试机
分选机大类文件夹：分选机
测试机数据子目录：测试档
分选机数据子目录：CN
```

页面里的“NAS 文件浏览”可以先按机台类型、机台号/文件名、文件格式、导入状态和修改时间过滤文件；确认范围后再点“扫描筛选文件”。如果要直接查看 NAS 里的原始文件，可以点“打开 NAS / 打开测试机 / 打开分选机 / 打开目录”，系统会打开当前运行 ERP 服务那台机器上的挂载目录。

### 5. 卸载 NAS

不用时可以卸载：

```bash
./scripts/nas-macos.sh unmount
```

### 6. 本地常见问题

- `Path does not exist`：通常是 `NAS_SUB_PATH` 写错，先用 `./scripts/nas-macos.sh status` 看挂载根目录下有哪些文件夹。
- `mount_smbfs: URL parsing failed`：通常是共享名中文或密码特殊字符没有 URL 编码。请用 `NAS_SMB_HOST`、`NAS_SMB_USER`、`NAS_SMB_PASSWORD`、`NAS_TESTER_SMB_SHARE`、`NAS_SORTER_SMB_SHARE` 的拆分配置。
- `mount_smbfs: server connection failed: Operation timed out`：通常是这台 Mac 直连不到 NAS 的 SMB 445 端口。先跑 `./scripts/nas-macos.sh doctor`，并确认 Mac 和 NAS 在同一局域网/VPN、NAS SMB 服务已开启、防火墙没有拦截。
- ERP 提示路径不存在：确认本地 Node 服务和挂载目录在同一台 Mac 上，并且 ERP 里填写的是本地路径，不是 `smb://...`。
- 如果 NAS 共享名是 `团队文件-测试机`、`团队文件-分选机`，ERP 页面里不要再填 `团队空间`，统一填 `/Users/stephen/kh-erp-nas`。

也可以静态预览，但静态预览只会使用浏览器 `localStorage`，多台电脑之间不会共享数据：

```bash
python3 -m http.server 4174
```

## 数据保存在哪里

- 后端服务模式：保存到 `data/kh-erp-db.json`。
- 静态预览模式：保存到当前浏览器的 `localStorage`。
- `data/` 已加入 `.gitignore`，真实业务数据不会提交到 GitHub。

## 默认账号

- 管理员：`admin / admin123`
- 录单人员：`clerk / clerk123`

部署到公网后，第一件事请登录管理员账号，在“用户权限”里修改管理员密码，并创建正式录单人员账号。

## 当前权限

- 管理员：全部模块权限，可创建/编辑/删除用户，可删除来料和库存记录。
- 录单人员：默认可查看、新增、编辑来料单；其他模块只读。
- 用户权限页可给非管理员配置可编辑模块，后端接口会同步校验。

## 标准线上部署流程

以后统一使用“登录服务器后部署”的方式。Mac 本地只负责提交和推送代码，服务器负责拉取 GitHub 最新代码并重启服务。

### 1. 本地提交并推送

在 Mac 本地项目目录执行：

```bash
cd /Users/stephen/Documents/codexWorkspace
git status
git add .
git commit -m "本次修改说明"
git push origin main
```

如果 `git status` 显示没有修改，就不需要 `git add` 和 `git commit`，只确认 `git push origin main` 已经成功即可。

### 2. 登录服务器

在 Mac 终端执行：

```bash
ssh root@118.145.87.70
```

输入服务器密码后，看到类似下面的提示就表示已经在服务器上：

```text
root@kh-erp:~#
```

### 3. 进入项目目录并部署

在服务器上执行：

```bash
cd /opt/kh-erp
./deploy.sh
```

正常输出应类似：

```text
1. Checking server tools...
2. Backing up data...
3. Updating code from GitHub...
4. Restarting service...
5. Verifying health...
{"ok":true,"name":"kh-erp","serverMode":true}
Deploy complete.
```

### 4. 退出服务器

部署完成后执行：

```bash
exit
```

### 5. 部署脚本做了什么

`/opt/kh-erp/deploy.sh` 会自动完成：

- 检查服务器是否有 `git`、`npm`、`curl`
- 备份线上数据库 `data/kh-erp-db.json` 到 `backups/`
- 从 GitHub 拉取 `main` 分支最新代码
- 停止旧的 Node 服务
- 用 `HOST=0.0.0.0 PORT=4173 npm run start` 重新启动
- 检查 `http://127.0.0.1:4173/api/health`

### 6. 常用排错命令

在服务器上查看服务日志：

```bash
cd /opt/kh-erp
tail -n 100 kh-erp.log
```

检查后端健康状态：

```bash
curl http://127.0.0.1:4173/api/health
```

检查首页是否返回 HTML：

```bash
curl -I http://127.0.0.1:4173/
```

查看 Node 服务进程：

```bash
ps -ef | grep "server/server.js" | grep -v grep
```

### 7. 回滚数据

如果只是数据出问题，可以从备份恢复。先查看备份：

```bash
cd /opt/kh-erp
ls -lh backups/
```

恢复某一个备份：

```bash
cp backups/kh-erp-db-YYYYMMDD-HHMMSS.json data/kh-erp-db.json
./deploy.sh
```

## GitHub 说明

本项目的代码仓库继续同步到 GitHub 作为版本备份。线上服务器标准更新方式是服务器执行 `./deploy.sh`，由服务器从 GitHub 拉取最新代码。

后续正式生产建议把文件型数据迁移到 MySQL/PostgreSQL，并加上操作日志、审批流和备份策略。
