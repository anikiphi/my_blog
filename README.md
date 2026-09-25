# Anikiphi 的博客

博客地址：https://anikiphi.github.io/my_blog/

这个博客专门为不熟悉命令行的使用者设计。日常发布只需要使用浏览器。

## 方法一：粘贴文章发布

1. 打开 GitHub 仓库：https://github.com/anikiphi/my_blog
2. 点击 `Issues`。
3. 点击 `New issue`。
4. 选择 `发布文章`。
5. 填写标题；如果需要，再填写标签和摘要。
6. 把文章正文粘贴到“正文”框。
7. 点击 `Submit new issue`。

发布完成后，自动程序会：

- 生成博客文章；
- 提交到仓库；
- 构建并发布网站；
- 在 Issue 中留言，然后自动关闭 Issue。

通常等待 1 到 2 分钟，然后刷新博客即可看到文章。

## 方法二：上传 TXT

1. 打开仓库里的 `inbox` 文件夹。
2. 点击 `Add file` → `Upload files`。
3. 上传一个 `.txt` 文件，例如 `我的第一篇文章.txt`。
4. 点击 `Commit changes`。

文件名会作为文章标题，文件内容会作为正文。发布后，原 TXT 文件会自动从 `inbox` 文件夹移除。

## 图片

推荐使用方法一的 Issue 编辑框：

1. 写好正文。
2. 把图片直接拖进正文输入框。
3. GitHub 会自动上传图片。
4. 点击提交。

## 首次启用 GitHub Pages

仓库第一次上传后，在 GitHub 网页中打开：

`Settings` → `Pages` → `Build and deployment` → `Source`

选择：

`GitHub Actions`

之后每次发布文章都会自动重新构建网站。

## 首次上传这个本地文件夹

推荐使用 GitHub Desktop：

1. 安装 GitHub Desktop，并使用 GitHub 账号登录。
2. 点击 `File` → `Add local repository`。
3. 选择 `my_blog` 文件夹。
4. 如果窗口显示 `.git` 已存在，直接点击 `Push origin`。
5. 如果 GitHub Desktop 提示需要授权，按提示登录 GitHub。

以后修改文字、上传 TXT 或创建发布 Issue 后，自动流程都会更新网站。

## 需要修改的地方

- 修改博客名称：编辑 `hugo.toml` 中的 `title`。
- 修改默认地址：如果以后绑定自己的域名，同时修改 `hugo.toml` 中的 `baseURL`。
- 更换头像或图片：上传到 `static/images`。