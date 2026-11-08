# 主页维护

将本目录中的 `README.md`、`assets/`、`data/`、`scripts/` 和 `.github/` 一起提交到公开仓库 **imacte/imacte** 的默认分支。README 必须位于仓库根目录，不能只上传单个 README 文件。

## 外观

- 显示名：**imacte**。
- 亮色：粉白配色；暗色：深色背景与霓虹点缀。
- 桌面两张统计卡片均为 **800 × 160**，上下排列；语言图例为三列两行。600px 以下的窗口自动选用 **320 × 160** 的手机卡片，语言图例改为两列三行，方便阅读。
- `<picture>` 为访客的亮暗主题选择对应 SVG。正文使用 GitHub 的原生排版，页面背景由访客的 GitHub 主题控制。
- 可编辑内容位于 `README.md`；图片配色、头图和项目介绍位于 `scripts/generate-profile.mjs`。

## 统计更新

工作流 `Update profile cards` 在每天 **北京时间 08:23** 计划刷新，也可以在 GitHub 的 **Actions → Update profile cards → Run workflow** 中手动运行。GitHub 调度和上游缓存可能导致更新延迟。

统计来自 [GitHub Stats Extended](https://github.com/stats-organization/github-stats-extended)，包含公开仓库统计。语言卡片采用该服务的默认统计范围和比例；它表示代码语言分布，不是熟练度评分。

卡片的源数据保存在 `data/stats.json`。生成器会验证两份响应后再写入图片；请求失败或返回错误卡片时，工作流失败并保留仓库中的上一版图片。运行使用仓库自带的 `GITHUB_TOKEN` 提交结果，无需配置个人访问令牌。

## 本地操作

需要 **Node.js 24**，无额外依赖。

```powershell
# 刷新在线统计，并生成所有亮暗图片
node scripts/generate-profile.mjs --refresh

# 仅使用已有统计重新生成图片（修改配色或文案后使用）
node scripts/generate-profile.mjs

# 检查解析与图片生成逻辑
node --test scripts/generate-profile.test.mjs
```

如果默认分支保护规则不允许机器人直接提交，需要为这个个人主页仓库允许工作流写入，或在本地刷新后手动提交。

GitHub 的主题图片规则见 [官方文档](https://docs.github.com/en/get-started/writing-on-github/getting-started-with-writing-and-formatting-on-github/quickstart-for-writing-on-github#adding-an-image-to-suit-your-visitors)。
