同行者众 · 需要公司去申请的账号和资质

请用公司营业执照同一主体办理。个人名下开不了微信支付和商用短信。
现有域名：togetherbetter.cn（已解析到腾讯云轻量 `140.143.171.77`）

建议顺序：执照/对公户 → 域名 → ICP 备案 → HTTPS → 小程序认证备案 → 微信支付 → 短信签名


一、先备好材料（一次性复印/拍照）

营业执照副本
法人身份证正反面
经办人身份证
对公账户（开户名须与执照全称一致，含开户行、账号）
一个长期使用的法人或财务微信号（微信支付超级管理员，不要用临时号）
公司固定电话或法人手机（备案、短信都会用，尽量统一）
小程序要用的名称、简介、logo（建议名称：同行者众；图标用仓库 `web/public/brand/logo.jpg`）


二、域名

去哪买
腾讯云：https://dnspod.cloud.tencent.com/
阿里云：https://wanwang.aliyun.com/

做什么
买一个可备案的域名（.com 或 .cn），例：beiyexing.com
域名实名认证必须和营业执照一致
域名已解析到 140.143.171.77（`togetherbetter.cn` / `www.togetherbetter.cn`）


三、网站备案（国内服务器用域名必须，大约 7–20 个工作日）

腾讯云备案：https://console.cloud.tencent.com/beian
用现有腾讯云账号，选这台轻量服务器
工信部核验：https://beian.miit.gov.cn/
初审后会收到 12381 短信，必须 24 小时内点开核验，过期要重来

网站备案号 `京ICP备2026060284号-2`（主体号 `京ICP备2026060284号`），挂在 H5 底栏上方，链到 https://beian.miit.gov.cn/ 。

上线后 30 日内还要做公安联网备案：https://www.beian.gov.cn/ 。做完得到「京公网安备」号，再挂到备案号旁边。

四、HTTPS 证书（小程序和支付都要求 https）

网站备案通过后，在服务器执行 `scripts/enable-https.sh`，用 Let's Encrypt 签 `togetherbetter.cn` 和 `www.togetherbetter.cn`。证书不进仓库，到期前由 certbot 自动续。不必再去腾讯云控制台单独买证书，除非要换成他们的证书。

还要在轻量控制台放行 **TCP 443**，来源 `0.0.0.0/0`：

1. 打开 https://console.cloud.tencent.com/lighthouse/instance
2. 点 `140.143.171.77` 这台机 → 防火墙
3. 添加规则：协议 TCP，端口 443，来源 0.0.0.0/0

防火墙已放行 TCP 443。域名的 HTTP 会跳到 HTTPS，直接打开 https://togetherbetter.cn/m 。


五、微信小程序

注册：https://mp.weixin.qq.com/
右上角「立即注册」→ 选「小程序」→ 主体选公司
邮箱不能是已经注册过公众平台的邮箱

注册后请完成三件事
1. 设置 → 微信认证（企业，约 300 元/年）。不认证开不了支付
2. 首页「去备案」（小程序也要 ICP 备案，不上架也要备）
3. 把 AppID、AppSecret 交给技术（设置 → 基本设置）

说明：https://developers.weixin.qq.com/miniprogram/introduction/

可选：同一网站再注册一个「公众号」，给官方微信用，和小程序不是同一个账号


六、微信支付（必做，用来收会员费、团费、原路退款）

前提：小程序已经企业认证；执照、对公户、小程序主体名称完全一致

去哪申请（两处任选一处，材料相同）
https://pay.weixin.qq.com/  右上角「接入微信支付」
或小程序后台左侧「微信支付」→ 新申请

用上面准备好的微信号扫码，这个号会变成商户超级管理员。

要交的材料
营业执照、法人身份证、对公账户
商户简称：同行者众
经营类目按提示选（旅游/休闲/生活服务等，按页面要求补合同即可）
客服电话、经营地址

流程：提交资料 → 对公户收到一笔小额打款并回填金额 → 审核通过 → 手机上签约、人脸识别
审核一般 1–2 个工作日。申请免费，之后按交易抽大约 0.6%–1%。

绑定：商户平台「产品中心 → AppID 绑定」填小程序 AppID，再到小程序后台「微信支付 → 商户号管理」点确认。
当前已绑定：AppID `wx205ca387929c002a`，商户号 `17501360384`（同行者众（北京）体育科技有限公司）。

技术还需要（私下发，不要截长图进群）：
1. 小程序 AppSecret：公众平台 → 开发 → 开发管理 → 开发设置
2. 商户 APIv2 密钥（32 位）：微信支付商户平台 → 账户中心 → API 安全 → 设置 APIv2 密钥
3. 支付回调是 `https://togetherbetter.cn/api/pay/wechat/notify`。小程序后台「开发 → 开发管理 → 开发设置 → 服务器域名」填：

   request、uploadFile、downloadFile 都填 `https://togetherbetter.cn`（不要带路径，不要写 IP）。

   服务器上还没有 AppSecret / APIv2 密钥时，支付仍是演示模式（`WX_PAY_MOCK=1`），不会向微信真实扣款。

配到服务器 `.env`：`WX_APPID` `WX_APPSECRET` `WX_MCH_ID` `WX_MCH_KEY`，并把 `WX_PAY_MOCK=0`。不要把密钥提交进 Git。原路退款再配 `WX_MCH_CERT_PATH`（apiclient_cert.pem）和 `WX_MCH_KEY_PATH`（apiclient_key.pem）。

证书和密钥由超级管理员在商户平台扫码下载。没有退款证书时，演示环境仍按付款人记账退款；真收款后取消/解散会提示无法原路退。


七、短信（验证码、解散通知、发券通知）

不要去营业厅办端口。用云厂商短信，由他们向移动/联通/电信报备。

腾讯云（建议，和服务器同一家）：https://console.cloud.tencent.com/smsv2
报备说明：https://cloud.tencent.com/document/product/382/117410

或阿里云：https://dysms.console.aliyun.com/

要做
企业实名开通短信服务
交执照、法人和短信管理员身份证
申请签名：同行者众（来源选企事业单位名）
等三网报备通过，大约 7–10 个工作日
模板交给技术写（验证码、解散、优惠券）


八、申请完了怎么处理

不要发到公司大群。私下发给技术（微信或邮件），由技术填到服务器。负责人不用自己改网站。

发这些即可：
1. 域名，以及备案是否已通过
2. 小程序 AppID、AppSecret（设置 → 基本设置）
3. 微信支付商户号（一串数字）
4. 短信平台账号，以及签名「同行者众」是否已报备通过
5. 若换了新服务器：新公网 IP、登录用户名（一般是 ubuntu），并说明已把技术给的公钥加到这台机器

密钥、证书、AppSecret 不要截长图发群。技术收到后会配域名、https、小程序和支付，配好再告诉你访问地址。


九、网址速查

买域名（腾讯云）  https://dnspod.cloud.tencent.com/
网站备案          https://console.cloud.tencent.com/beian
工信部核验        https://beian.miit.gov.cn/
免费 HTTPS        https://console.cloud.tencent.com/ssl
微信小程序        https://mp.weixin.qq.com/
微信支付          https://pay.weixin.qq.com/
腾讯云短信        https://console.cloud.tencent.com/smsv2
公安备案          https://www.beian.gov.cn/
