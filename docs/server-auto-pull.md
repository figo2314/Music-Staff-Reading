# 服务器定时拉取部署

这个项目构建后是静态网站，服务器只需要拉取 GitHub 仓库、执行构建、把 `dist/` 同步到 Nginx 站点目录。

## 更新链路

线上网站的更新来源是 GitHub `main` 分支：

```text
本地修改和验证
  -> git commit
  -> git push origin main
  -> 异地服务器定时拉取 origin/main
  -> npm ci && npm run build
  -> rsync dist/ 到 Nginx 站点目录
```

仓库地址：

```text
https://github.com/figo2314/Music-Staff-Reading
```

服务器不会读取开发电脑上的本地修改。必须先将修改成功推送到 GitHub，服务器的定时任务才会发现并部署新版本。

## 首次部署

```bash
sudo mkdir -p /opt/note-recognition-webapp /var/www/note-recognition
sudo chown -R "$USER":"$USER" /opt/note-recognition-webapp /var/www/note-recognition
git clone git@github.com:figo2314/Music-Staff-Reading.git /opt/note-recognition-webapp
cd /opt/note-recognition-webapp
npm ci
npm run build
rsync -a --delete dist/ /var/www/note-recognition/
```

## 定时更新

编辑 crontab：

```bash
crontab -e
```

每 5 分钟拉取一次：

```cron
*/5 * * * * REPO_DIR=/opt/note-recognition-webapp WEB_ROOT=/var/www/note-recognition BRANCH=main bash /opt/note-recognition-webapp/deploy/pull-build-deploy.sh >> /var/log/note-recognition-deploy.log 2>&1
```

推送后需要等待一个定时任务周期。可在服务器上查看部署日志和当前版本：

```bash
tail -n 50 /var/log/note-recognition-deploy.log
git -C /opt/note-recognition-webapp log -1 --oneline
```

## Nginx

把 `deploy/nginx.conf.example` 复制到 Nginx 站点配置里，修改 `server_name`，然后 reload：

```bash
sudo nginx -t
sudo systemctl reload nginx
```

## Node 版本

建议服务器使用 Node.js 20 LTS 或更高版本。

## 更新缓存

项目包含基础 PWA service worker。部署新版本后，浏览器通常会在下一次打开或刷新时更新缓存；如果测试时看不到最新内容，可以在浏览器里清理站点数据后重试。
