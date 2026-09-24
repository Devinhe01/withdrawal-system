# 存取款业务系统（无审批版）

## 项目结构

```
withdrawal-system/
├── package.json              # 后端依赖
├── .env.example              # 环境变量模板
├── server.js                 # 后端入口
├── db/
│   └── database.js           # SQLite数据库（自动建表）
├── routes/
│   ├── submit.js             # 提交+生成二维码
│   ├── verify.js             # 扫码核销+确认
│   ├── print.js              # 打印任务分发
│   └── reconcile.js          # 对账+审计日志
├── services/
│   ├── qrcode.js             # 二维码生成+验签
│   ├── security.js           # 链式哈希+异常检测
│   └── notify.js             # 群机器人通知
├── public/
│   ├── home.html             # 首页导航
│   ├── submit.html           # 提交申请页面
│   └── index.html            # 扫码核销页面
└── print-service/            # 本地打印服务（各网点部署）
    ├── package.json
    ├── .env.example
    └── print-service.js      # ESC/POS打印+轮询
```

## 部署步骤

### 1. 后端部署（Render.com 免费）

1. 上传整个 `withdrawal-system/` 到 GitHub
2. 在 render.com 创建 Web Service，连接 GitHub 仓库
3. 配置：Runtime=Node, Build=`npm install`, Start=`node server.js`, Plan=Free
4. 设置环境变量（参考 .env.example）：
   - `QR_SECRET` = 随机密钥（至少32位）
   - `WEWORK_WEBHOOK` = 企业微信群机器人地址
5. 部署完成，访问 `https://xxx.onrender.com` 看到首页

### 2. 本地打印服务（各网点电脑）

1. 安装 Node.js（nodejs.org）
2. 复制 `print-service/` 目录到电脑
3. 复制 `.env.example` 为 `.env`，修改：
   - `BRANCH_ID` = 网点标识（如 shanghai）
   - `BRANCH_NAME` = 网点名称（如 上海分公司）
   - `SERVER_URL` = 后端地址
4. 连接USB热敏打印机
5. 运行：`npm install && node print-service.js`
6. （可选）用 PM2 设置开机自启

### 3. 使用方式

- **提交申请**：手机打开 `/submit.html`，填写提交
- **扫码核销**：手机打开 `/index.html`，扫码核销
- **对账查看**：打开 `/api/reconcile/daily`
- **完整性检查**：打开 `/api/security/verify-chain`

## 成本

- 软件：¥0（全部开源免费）
- 服务器：¥0（Render免费额度）
- 打印机：~100-150元（一次性）
- 热敏纸：~5元/卷
