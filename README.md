# CHIBI LAB · 图片转 Q 版角色

上传动漫人物或球星照片，生成大头小身体的像素 Q 版或插画 Q 版。模型提示强调保留发型、面部特征、服装配色、球衣号码、武器与配饰。输出 1024 × 1024 PNG，支持白色或透明背景。

## 本地启动

需要 Node.js 22 或更新版本。项目使用 Node 内置 HTTP、Fetch 和测试工具，无第三方运行依赖。

```bash
cd /workspace/Codex
cp .env.example .env
# 编辑 .env，填写 IMAGE_API_KEY
npm start
```

默认端口 3000。开发时使用 `npm run dev`；验证使用 `npm test`。

## 页面预览

运行 `npm run build` 会在项目根目录生成独立的 `index.html`，内嵌样式、脚本和示意图片，适合单文件 HTML 预览。根目录和 `public/index.html` 均内嵌资源，任选其一预览。HTML 原始模板是 `public/page.template.html`，修改后运行构建。若预览平台禁止脚本，上传交互仍不可用，需要通过本地浏览器打开服务页面。静态预览可使用上传预览、风格和背景选择；它没有 Node 后端，不能直接调用生成接口。真实生成必须使用 `npm start` 提供的页面并配置密钥。页面会明确显示这两种状态。

## 图像模型配置

### 火山方舟

复制 `.env.ark.example` 为 `.env`，填写 `ARK_API_KEY` 和已开通的图像模型 `IMAGE_MODEL`（Seedream 模型 ID 或对应 ep- 接入点 ID）。密钥管理页本身不决定模型；不能填聊天模型。适配使用北京区域 `/api/v3/images/generations`，将参考图以 data URL 放入 JSON，请求 URL 格式和 2K 输出，服务器从火山图片域名下载后返回可下载的图像数据。模型须支持这些参数及图生图。火山模式仅开放白色背景，并根据返回编码提供 JPG 或 PNG 下载。目前只有模拟接口测试通过，真实密钥、模型权限、连通性和生成质量尚待验证。

在 Codex 环境设置中填写密钥时，目标变量名为 `ARK_API_KEY`，允许目标域名为 `ark.cn-beijing.volces.com`。填写 `IMAGE_PROVIDER=ark`、`IMAGE_API_BASE_URL=https://ark.cn-beijing.volces.com/api/v3` 和 `IMAGE_MODEL`，保存后重启服务。仅在火山控制台创建密钥不会自动注入本项目。

- `IMAGE_API_KEY`：服务器端密钥，也支持已有的 `OPENAI_API_KEY`。
- `IMAGE_API_BASE_URL`：默认 `https://api.openai.com/v1`。其他服务必须兼容 multipart `POST /images/edits`，支持参考图、`background`、`quality`、`output_format` 和 `b64_json` 输出；仅支持聊天接口的服务不可直接使用。
- `IMAGE_MODEL`：默认 `gpt-image-1`，可按服务支持情况调整。
- `PORT`：默认 3000。

API 密钥只保留在服务器，不发送至浏览器；`.env` 已加入 Git 忽略列表。生成会产生供应商费用，密钥须有对应模型权限和额度。无密钥时可以使用上传预览与风格选择，但生成按钮禁用；右侧原创 SVG 只是风格示意，并非真实转换结果。

## 工作流程

1. 上传 PNG、JPEG 或 WebP，最大 12 MB，建议使用清晰且人物无遮挡的全身图。
2. 选择像素或插画风格，可补充希望保留的特征，例如木刀、银发、球衣号码。
3. 选择背景，点击生成；服务器将参考图和特征提示发送至图像编辑模型。
4. 查看结果并下载 PNG；不满意可修改特征后重新生成。

模型生成不保证完全一致的人脸、准确文字或严格像素网格；输入清晰度、遮挡和模型能力会影响相似度。生成通常需要 1–3 分钟，服务器超时设为 4 分钟。本站不持久化图片，但供应商的数据政策仍适用。

## 架构与范围

`public/` 是响应式中文网页，`server.mjs` 提供静态页面、配置状态与图像编辑代理，`test/` 使用模拟供应商验证上传校验、multipart 请求和失败处理。测试不会产生 API 费用，也不证明真实模型的转换质量。

此版本适合本地开发与可信用户试用。向公众开放前应补充用户认证、限流、配额、任务队列与持久化存储；当前生成接口不具备这些生产控制。不要将带有付费密钥的服务直接暴露给公众。

项目为独立实现，未引入第三方开源项目代码，不需要本地 GPU。当前环境尚无密钥，真实图像生成尚未验证。
