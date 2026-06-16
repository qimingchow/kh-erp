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

## 线上部署流程

推荐用 `deploy.sh`，以后每次更新都按这个顺序走：

1. 在本地完成修改并提交。
2. 从本地把代码同步到云服务器。
3. 在云服务器备份 `data/kh-erp-db.json`。
4. 重启 Node 服务。
5. 访问本机健康检查和公网地址确认正常。

本地执行：

```bash
./deploy.sh
```

如果服务器地址或目录有变化，可以临时覆盖环境变量：

```bash
DEPLOY_HOST=118.145.87.70 DEPLOY_USER=root DEPLOY_DIR=/opt/kh-erp ./deploy.sh
```

脚本默认会：

- 先备份线上数据库文件到 `/opt/kh-erp/backups/`
- 再用 `rsync` 同步代码
- 然后重启服务
- 最后检查 `http://127.0.0.1:4173/api/health`

## 服务器手工步骤

如果你想手工操作，也可以按这个顺序：

```bash
ssh root@118.145.87.70
cd /opt/kh-erp
mkdir -p backups
cp data/kh-erp-db.json backups/kh-erp-db-$(date +%Y%m%d-%H%M%S).json
pkill -f "server/server.js" || true
nohup env HOST=0.0.0.0 PORT=4173 npm run start > kh-erp.log 2>&1 &
curl http://127.0.0.1:4173/api/health
```

## GitHub 说明

本项目的代码仓库建议继续同步到 GitHub 作为版本备份，但线上服务器更新不依赖服务器自己去 `git pull`。如果服务器访问 GitHub 不稳定，直接从本地同步会更稳。

后续正式生产建议把文件型数据迁移到 MySQL/PostgreSQL，并加上操作日志、审批流和备份策略。
