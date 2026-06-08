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
