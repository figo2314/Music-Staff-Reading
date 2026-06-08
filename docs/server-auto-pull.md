# 服务器定时拉取部署

这个项目构建后是静态网站，服务器只需要拉取 GitHub 仓库、执行构建、把 `dist/` 同步到 Nginx 站点目录。

## 首次部署

```bash
sudo mkdir -p /opt/note-recognition-webapp /var/www/note-recognition
sudo chown -R "$USER":"$USER" /opt/note-recognition-webapp /var/www/note-recognition
git clone git@github.com:YOUR_NAME/YOUR_REPO.git /opt/note-recognition-webapp
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
