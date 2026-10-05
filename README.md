# Ember · 日记与随想

基于 Hexo 8 的个人博客。正式地址：https://l728266513.github.io

## 日记保存位置

- `.private/posts/` 是本机日记原文，`.private/reading-password.txt` 是本机阅读密码。这两个位置已被 Git 忽略，请自行备份整个 `.private/` 目录。
- `source/_posts/` 仅保存公开的标题、日期、分类、标签、阅读时长和加密正文。正文及完整原始 Markdown 使用 PBKDF2-SHA256（600,000 次）与 AES-256-GCM 加密。
- 标题、日期、分类、标签、文章数量和网址仍公开。`source/images/` 里的图片也是公开文件，私密图片不要放在那里。
- 密文可以被下载并离线猜密码。短密码尤其容易被猜中；建议尽快用至少 16 位随机密码更换已公开的旧密码。

## 本机写作和预览

需要 Node.js 20.19 或更高版本。首次运行 `npm.cmd ci`，之后：

```powershell
npm.cmd run new -- "日记的标题"
```

编辑命令输出的 `.private/posts/YYYY-MM-DD-日记的标题.md`。不要把日记写进 `source/_posts/`；构建前的保护检查会拒绝未加密文章。日期晚于构建时间的文章默认不发布。日记与诗歌的单次换行会保留。

```powershell
npm.cmd run dev
```

打开 http://127.0.0.1:4000/ 预览；也可双击 `start-blog.cmd`。每次构建会把本机原文重新加密为公开文件；内容没有变化时保留原有密文，不会产生无意义的 Git 差异。

## 发布

```powershell
npm.cmd run build
npm.cmd run check
git status
git add source/_posts
git commit -m "发布新日记"
git push origin source
```

如果还修改了网站代码或公开图片，请一并提交。`public/` 是被忽略的生成目录，不要手动编辑或提交。GitHub Actions 在 `source` 分支推送后构建并发布到 GitHub Pages；远端无需、也不应保存 `.private/` 或密码。下载仓库后即使没有本机原文，也能直接用已有密文构建网站。

新设备需要先通过私下渠道取得阅读密码，再把它写入 `.private/reading-password.txt`（只写一行）。运行 `npm.cmd run diary:restore` 可从密文恢复完整 Markdown 到 `.private/posts/`，不会覆盖已有但内容不同的本机文件。密码文件和原文目录都应有单独备份：忘记密码后无法从密文恢复日记。

## 更换阅读密码

在本机终端运行 `npm.cmd run diary:password`，根据提示输入两次新密码；输入不会回显。随后运行 `npm.cmd run build` 和 `npm.cmd run check`，提交所有更新的 `source/_posts/` 密文并推送。旧密文在远端历史中仍可能被旧密码解开；需要取消旧密码的访问能力时，也必须清理远端历史和已发布的旧页面。

请勿在 front matter、README、命令参数、GitHub Actions Secret 或公开仓库中写阅读密码。密码不需要传给 GitHub Actions；浏览器在本地用输入的密码解密。当前标签页会话中已打开的文章可继续阅读。

## 已有仓库历史

**当前仓库旧提交曾包含日记原文。仅提交本次加密文件，不会删除那些原文。** 要使后来下载仓库的人无法从 Git 历史读到旧文章，必须用不含旧提交的新历史替换远端的 `source` 和 `main` 分支，或重新创建仓库。换分支、删除当前 Markdown 或添加 `.gitignore` 都不能清除已公开的旧历史。旧克隆、fork、GitHub 缓存或搜索引擎副本也无法靠本地改动收回。

在远端历史清理完成之前，不应把这个仓库当作私密日记仓库。

## 样式和功能

网站设置在 `_config.yml`，主题文案在 `themes/ember/_config.yml`，样式在 `themes/ember/source/css/style.css`，交互在 `themes/ember/source/js/main.js`。网站提供搜索、按年归档、标签、分页、阅读时长、相邻文章、RSS、站点地图和访客统计。搜索索引与 RSS 只含公开元数据，不包含正文。
