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
