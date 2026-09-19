# 部署（含只用 iPhone）

改代码、**合并到 GitHub 的 `main`** 之后：先跑 **Unit tests**，通过了才 **Deploy** 到腾讯云。部署发生在 GitHub Actions 的云主机上，不发生在你的 iPhone 或 Cursor 云环境里。功能分支和 Pull Request 不会自动上线。手机没有系统 SSH 不影响自动上线。

线上地址：<http://togetherbetter.cn/m>（`www.togetherbetter.cn` 同样可用）。SSH 部署默认登录 `ubuntu@140.143.171.77`。**`192.144.167.212` 已到期回收**，不要再写进 workflow。换机后：在仓库 Settings → Secrets and variables → Actions → **Variables** 把 `DEPLOY_HOST` 设成新 IP；安全组放行 **22 / 80**；用户是 **`ubuntu`**；GitHub Secret `DEPLOY_SSH_KEY` 对应的公钥写进新机 `~/.ssh/authorized_keys`。若要保留旧数据，先把旧机 `/var/www/beiyexing/server/data/app.sqlite*`、`.env`、`server/public/static/uploads/` 拷到新机同路径（部署脚本不会覆盖已有 `.env` 和数据库）。小程序后台的 request / upload 合法域名也要改成新地址。未配置密钥或主机仍指向已回收 IP 时，Deploy 会**跳过**而不是报红。HTTPS 还没开，先走 http；轻量控制台「设置 HTTPS」配好证书后，再改 https。

合入前必须 UT 绿灯：在 [Rulesets](https://github.com/xiangxiang222/bj-outdoor-trip/settings/rules) 给 `main` 勾选 Require status checks → `unit-tests`。说明见 [TESTING.md](./TESTING.md) 第 7 节。

**Deploy 已停用。** `192.144.167.212` 到期回收后，Actions 还在打这台机，缺密钥就会把 `main` 刷红。仓库里的 Deploy workflow 已关掉。换新机后再打开：

1. 轻量机用户 `ubuntu`，安全组放行 22 / 80，域名 `togetherbetter.cn` 解析到新 IP
2. Settings → Secrets `DEPLOY_SSH_KEY` = 该机私钥全文；Variables `DEPLOY_HOST` = 新 IP
3. 把 `scripts/deploy.workflow.yml` 覆盖到 `.github/workflows/deploy.yml`（改 workflow 文件需要 GitHub token 的 `workflow` 权限，网页改文件或本机 `gh auth refresh -s workflow` 后再推）
4. `gh workflow enable deploy.yml`，再 Actions → Deploy → Run workflow

未配置密钥或主机仍是已回收 IP 时，新 workflow 会跳过而不是失败。

## 日常（配好密钥之后）

1. 开 Pull Request，等 Actions 里 **Unit tests / unit-tests** 绿灯后再合并
2. 合并后看 **Unit tests** 再看 **Deploy** 是否先后绿灯
3. 手机 Safari 打开上面的线上地址，强刷缓存

也可以在 Actions 里打开 Deploy → **Run workflow** 手动再跑一次，不必再推代码。

**不要**在生产库执行 `npm run seed`（会清空业务数据）。`scripts/deploy.sh` 只在服务器上还没有数据库文件时才会 seed。

## 一次性：让 GitHub 能登录腾讯云

仓库已有 `.github/workflows/deploy.yml`。它需要一个 **Actions Secret**，名字必须是 **`DEPLOY_SSH_KEY`**，内容是能登录服务器 `ubuntu@140.143.171.77` 的 **SSH 私钥全文**（含头尾 `BEGIN` / `END` 那两行）。

注意：

- 配在 **Settings → Secrets and variables → Actions**，**不是** Deploy keys（Deploy keys 是仓库拉代码用的公钥，Actions 读不到）。
- 服务器用户必须是 **`ubuntu`**，不要写成 `root`。公钥进 `ubuntu` 的 `~/.ssh/authorized_keys`。
- 私钥只放进 GitHub Secret，**不要**发到聊天、不要提交进仓库。若私钥已经泄露，在服务器删掉对应公钥并重新 `ssh-keygen`。

下面两步都在 **手机 Safari** 就能做完，不需要 Mac。

### 1. 准备一对专用部署密钥

任选一种：

**A. 腾讯云控制台生成（推荐，只有手机时最省事）**

1. 打开 [轻量应用服务器控制台](https://console.cloud.tencent.com/lighthouse/instance)
2. 找到 `140.143.171.77` 这台机
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
3. 等绿灯后访问 <http://togetherbetter.cn/m>

以后只要 `main` 有新推送，就会自动再部署，iPhone 上不用再做任何 SSH。

## 电脑（可选）

本机已经能 `ssh ubuntu@140.143.171.77` 时，在项目根目录：

```bash
./scripts/deploy.sh
```

GitHub Secret 用的可以是同一把私钥，也可以是上面那种「只给 Actions 用」的新密钥。

## 失败时看什么

| 现象 | 原因 |
| --- | --- |
| Deploy 日志写「跳过部署」且仍是绿灯 | 还没配 `DEPLOY_SSH_KEY`，或 `DEPLOY_HOST` 仍是已回收的 `192.144.167.212` |
| Actions 报「缺少 GitHub Secret：DEPLOY_SSH_KEY」 | 旧 workflow；更新后改为跳过而不是失败 |
| `Permission denied (publickey)` | 私钥和服务器 `authorized_keys` 不是一对，或用户不是 `ubuntu` |
| 页面还是旧版 | 部署没成功或被跳过，或手机浏览器缓存；先看 Actions 是否真的 Sync |
| `Permission denied` 且密钥看起来对 | 密钥加给了 `root`，或贴进了 Deploy keys；改成 `ubuntu` + Actions Secret |
| 功能分支已推但线上没变 | 只有 `main` 会触发 Deploy；先合并 PR |

线上进程：PM2 名 `beiyexing`，目录 `/var/www/beiyexing`。部署脚本不会在已有数据库上执行 `npm run seed`。
