# 部署（含只用 iPhone）

改代码、推到 GitHub 的 `main` 之后，**部署发生在 GitHub Actions 的云主机上**，不发生在你的 iPhone 或 Cursor 云环境里。手机没有系统 SSH 不影响自动上线。

线上地址：<http://192.144.167.212/m>

## 日常（配好密钥之后）

1. 在 Cursor（电脑或手机）把改动推到 `main`
2. 打开仓库 [Actions](https://github.com/xiangxiang222/bj-outdoor-trip/actions) 看 **Deploy** 是否绿灯
3. 手机 Safari 打开上面的线上地址，强刷缓存

也可以在 Actions 里打开 Deploy → **Run workflow** 手动再跑一次，不必再推代码。

**不要**在生产库执行 `npm run seed`（会清空业务数据）。`scripts/deploy.sh` 只在服务器上还没有数据库文件时才会 seed。

## 一次性：让 GitHub 能登录腾讯云

仓库已有 `.github/workflows/deploy.yml`。它需要一个 Secret，名字必须是 **`DEPLOY_SSH_KEY`**，内容是能登录服务器 `ubuntu@192.144.167.212` 的 **SSH 私钥全文**（含头尾 `BEGIN` / `END` 那两行）。

下面两步都在 **手机 Safari** 就能做完，不需要 Mac。

### 1. 准备一对专用部署密钥

任选一种：

**A. 腾讯云控制台生成（推荐，只有手机时最省事）**

1. 打开 [轻量应用服务器控制台](https://console.cloud.tencent.com/lighthouse/instance)
2. 找到 `192.144.167.212` 这台机
3. 用控制台的 **网页终端 / 登录** 进系统（走腾讯云网页，不走系统 SSH）
4. 在网页终端执行：

```bash
mkdir -p ~/.ssh && chmod 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/github_deploy -N "" -C "github-actions-deploy"
cat ~/.ssh/github_deploy.pub >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
echo "===== 下面整段复制到 GitHub Secret ====="
cat ~/.ssh/github_deploy
```

把终端里 `BEGIN` 到 `END` 的整段私钥复制下来（可先粘到备忘录）。公钥已经写进服务器，不用再拷。

**B. 用 Termius / Blink 生成**

在 App 里新建 ED25519 密钥，把**公钥**追加到服务器 `ubuntu` 用户的 `~/.ssh/authorized_keys`（同样用腾讯云网页终端粘贴最省事），把**私钥**留给下一步。

不要用登录密码代替密钥。GitHub Actions 只能用私钥免密登录。

### 2. 把私钥交给 GitHub（手机 Safari）

1. 打开  
   <https://github.com/xiangxiang222/bj-outdoor-trip/settings/secrets/actions>
2. **New repository secret**
3. Name 填：`DEPLOY_SSH_KEY`（必须一字不差）
4. Secret 粘贴私钥全文
5. 保存

不要把私钥发到聊天里、不要提交进仓库。Secret 只有 GitHub Actions 能读。

### 3. 跑一次部署确认

1. 打开 <https://github.com/xiangxiang222/bj-outdoor-trip/actions/workflows/deploy.yml>
2. 右侧 **Run workflow** → 选 `main` → Run
3. 等绿灯后访问 <http://192.144.167.212/m>

以后只要 `main` 有新推送，就会自动再部署，iPhone 上不用再做任何 SSH。

## 电脑（可选）

本机已经能 `ssh ubuntu@192.144.167.212` 时，在项目根目录：

```bash
./scripts/deploy.sh
```

GitHub Secret 用的可以是同一把私钥，也可以是上面那种「只给 Actions 用」的新密钥。

## 失败时看什么

| 现象 | 原因 |
| --- | --- |
| Actions 报「缺少 GitHub Secret：DEPLOY_SSH_KEY」 | 还没在仓库 Settings → Secrets 里添加，或名字写错 |
| `Permission denied (publickey)` | 私钥和服务器 `authorized_keys` 不是一对，或用户不是 `ubuntu` |
| 页面还是旧版 | 部署没成功，或手机浏览器缓存；先看 Actions 是否绿灯再强刷 |
