# 五线谱认谱网站

面向儿童的卡片式五线谱认谱练习网站。第一版是纯前端静态应用，练习历史保存在浏览器本地。

## 功能

- 高音谱号认谱练习
- 每日题数设置
- CDEFGAB / Do Re Mi 答案切换
- 答对答错动画反馈
- 星星、徽章、贴纸奖励
- 错题加权复习
- 本地历史记录
- 移动端优先布局

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物在 `dist/`，可以直接用 Nginx 或任意静态网站服务托管。

## 固定更新工作流

本项目使用以下固定流程更新线上网站：

```text
本地修改和验证
  -> 提交到本地 Git
  -> 推送到 GitHub 仓库 main 分支
  -> 异地部署服务器定时自动拉取 GitHub
  -> 服务器自动构建并同步到 Nginx 站点目录
```

GitHub 仓库：

```text
https://github.com/figo2314/Music-Staff-Reading
```

每次修改完成后必须执行：

```bash
npm run build
npm run lint
git add <本次修改的文件>
git commit -m "描述本次修改"
git push origin main
```

只有成功推送到 GitHub 的更新，异地服务器才能自动拉取并部署。本地修改或仅本地提交不会更新线上网站。

推送后可检查本地与远程是否同步：

```bash
git status --short --branch
```

输出为 `main...origin/main` 且没有其他修改时，表示本地工作区与 GitHub 已同步。

## 部署

服务器定时拉取 GitHub 并部署的说明见：

```text
docs/server-auto-pull.md
```

示例脚本：

```text
deploy/pull-build-deploy.sh
```

Nginx 示例：

```text
deploy/nginx.conf.example
```
