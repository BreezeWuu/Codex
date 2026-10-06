import './load-env.mjs';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_IMAGE = 12 * 1024 * 1024;
const styles = { pixel: 'Pixel art sprite, crisp square pixels, bold black outlines, limited harmonious palette, no blur or anti-aliasing.', illustration: 'Clean chibi anime illustration, expressive eyes, crisp linework, soft cel shading.' };
function safeServiceError(raw, key) {
  let detail = '';
  try { const body = JSON.parse(raw); detail = body.error?.message || body.message || ''; } catch {}
  if (typeof detail !== 'string') return '';
  if (key) detail = detail.split(key).join('[密钥已隐藏]');
  return detail.replace(/Bearer\s+\S+/gi, 'Bearer [已隐藏]').replace(/(?:sk-|tp-)[A-Za-z0-9_-]+/g, '[密钥已隐藏]').replace(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/g, '[图片数据已隐藏]').replace(/https?:\/\/[^\s"<>]+/g, '[服务地址已隐藏]').slice(0, 900);
}
async function readGeneratedImage(url, fetchImpl) {
  const target = new URL(url);
  const hosts = ['volces.com', 'volccdn.com', 'byteimg.com', 'ibyteimg.com'];
  if (target.protocol !== 'https:' || target.username || target.password || (target.port && target.port !== '443') || !hosts.some(h => target.hostname.endsWith('.' + h))) throw new Error('UNSUPPORTED_IMAGE_HOST');
  // Never send the API credential to an image URL, or follow redirects to arbitrary hosts.
  const response = await fetchImpl(target.href, {signal:AbortSignal.timeout(60000), redirect:'error'});
  if (!response.ok) throw new Error('IMAGE_DOWNLOAD_FAILED');
  const chunks = []; let count = 0;
  for await (const chunk of response.body) { count += chunk.length; if (count > 30 * 1024 * 1024) throw new Error('IMAGE_TOO_LARGE'); chunks.push(chunk); }
  const bytes = Buffer.concat(chunks);
  if (!bytes.length) throw new Error('IMAGE_DOWNLOAD_FAILED');
  return bytes.toString('base64');
}
export function makePrompt({ style = 'pixel', features = '', background = 'white' }) {
  if (!styles[style] || !['white', 'transparent'].includes(background)) throw new Error('无效的风格或背景选项');
  return `Transform the person or character in the supplied reference image into a recognizable full-body chibi character. ${styles[style]} Oversized head, about 60% of total height, tiny body, short limbs, 2-head-tall proportions. Preserve distinctive facial features, hair silhouette and color, expression, outfit colors and patterns, jersey number if visible, footwear, and visible signature weapons or accessories. Keep the original identity clearly recognizable; do not substitute a generic character. Do not invent weapons or accessories absent from the reference unless explicitly requested. Single character centered, complete silhouette and feet visible, generous margins, ${background === 'transparent' ? 'transparent background' : 'plain white background'}, no captions, no watermark. Additional user preferences (subordinate to preserving identity): ${String(features).slice(0, 600)}`;
}
function validateImage(data, mime) {
  if (typeof data !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('图片数据无效');
  const bytes = Buffer.from(data, 'base64');
  if (!bytes.length || bytes.length > MAX_IMAGE) throw new Error('图片最大支持 12 MB');
  const png = bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP';
  if (!((mime === 'image/png' && png) || (mime === 'image/jpeg' && jpeg) || (mime === 'image/webp' && webp))) throw new Error('请上传有效的 PNG、JPG 或 WebP 图片');
  return bytes;
}
export function createServer({ env = process.env, fetchImpl = fetch } = {}) {
  const ark = env.IMAGE_PROVIDER === 'ark' || !!env.ARK_API_KEY || /ark\.[^/]*volces\.com/.test(env.IMAGE_API_BASE_URL || '');
  const key = ark ? (env.ARK_API_KEY || env.IMAGE_API_KEY) : (env.IMAGE_API_KEY || env.OPENAI_API_KEY);
  const model = env.IMAGE_MODEL || (ark ? '' : 'gpt-image-1');
  const send = (res, status, payload) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(payload)); };
  return http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/api/status') return send(res, 200, { configured: !!key && !!model, model, provider: ark ? 'ark' : 'openai', transparentSupported: !ark, size: ark ? '2K' : '1024 × 1024', message: !key ? `请配置 ${ark ? 'ARK_API_KEY' : 'IMAGE_API_KEY'} 并重启服务。` : !model ? '请填写 IMAGE_MODEL（火山图像模型 ID 或接入点 ID）并重启服务。' : '凭据已配置，实际连通性以生成结果为准。' });
      if (req.method === 'POST' && req.url === '/api/generate') {
        if (!key) return send(res, 503, { error: '尚未配置图像模型。请在服务器 .env 中设置 IMAGE_API_KEY 后重启。' });
        if (!model) return send(res, 503, {error:'请填写 IMAGE_MODEL（火山图像模型 ID 或接入点 ID）。'});
        if (!req.headers['content-type']?.startsWith('application/json')) return send(res, 415, {error:'请求需要 JSON 格式'});
        let total = 0; const chunks = [];
        for await (const chunk of req) { total += chunk.length; if (total > MAX_IMAGE * 1.4 + 4096) { send(res, 413, {error:'图片最大支持 12 MB'}); req.resume(); return; } chunks.push(chunk); }
        let body, bytes, prompt;
        try { body = JSON.parse(Buffer.concat(chunks)); bytes = validateImage(body.image, body.mime); prompt = makePrompt(body); } catch (e) { return send(res, 400, { error: e.message }); }
        if (ark && body.background === 'transparent') return send(res, 400, {error:'当前火山适配仅支持白色背景，透明背景需要另行抠图。'});
        const form = new FormData();
        form.set('model', env.IMAGE_MODEL || 'gpt-image-1'); form.set('prompt', prompt);
        form.set('image', new Blob([bytes], {type: body.mime}), `reference.${body.mime === 'image/jpeg' ? 'jpg' : body.mime.split('/')[1]}`);
        form.set('size', '1024x1024'); form.set('quality', 'high'); form.set('n', '1'); form.set('output_format', 'png');
        form.set('background', body.background === 'transparent' ? 'transparent' : 'opaque');
        const base = (env.IMAGE_API_BASE_URL || (ark ? 'https://ark.cn-beijing.volces.com/api/v3' : 'https://api.openai.com/v1')).replace(/\/$/, '');
        const upstream = await fetchImpl(`${base}/images/${ark ? 'generations' : 'edits'}`, {method:'POST', headers:{Authorization:`Bearer ${key}`, ...(ark ? {'Content-Type':'application/json'} : {})}, body:ark ? JSON.stringify({model, prompt, image:`data:${body.mime};base64,${bytes.toString('base64')}`, size:env.IMAGE_SIZE || '2K', response_format:'url', watermark:false}) : form, signal:AbortSignal.timeout(240000)});
        if (!upstream.ok) {
          const detail = safeServiceError(await upstream.text(), key);
          return send(res, 502, {error: `图像服务返回 ${upstream.status}。${detail || '请检查模型 ID、参数、权限与额度。'}`});
        }
        const result = await upstream.json();
        const item = result.data?.[0];
        if (!item?.b64_json && !(ark && item?.url)) return send(res, 502, {error:'图像服务没有返回生成图片。'+safeServiceError(JSON.stringify({error:item?.error || result.error}), key)});
        const encoded = item.b64_json || await readGeneratedImage(item.url, fetchImpl);
        const outputMime = Buffer.from(encoded, 'base64')[0] === 255 ? 'image/jpeg' : 'image/png';
        return send(res, 200, { image: `data:${outputMime};base64,${encoded}`, mime:outputMime, size:item.size || (ark ? (env.IMAGE_SIZE || '2K') : '1024 × 1024') });
      }
      const files = {'/':'index.html', '/app.js':'app.js', '/style.css':'style.css', '/sample.svg':'sample.svg'};
      if (req.method !== 'GET' || !files[req.url]) return send(res,404,{error:'Not found'});
      const name = files[req.url]; const data = await readFile(new URL(`./public/${name}`, import.meta.url));
      res.writeHead(200, {'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/javascript', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin'}); res.end(data);
    } catch(e) { send(res,502,{error: e.name === 'TimeoutError' ? '生成超时，请稍后重试。' : e.message === 'UNSUPPORTED_IMAGE_HOST' ? '已生成图片，但返回了尚未支持的图片域名，无法下载。请联系开发者添加供应商域名。' : ['IMAGE_DOWNLOAD_FAILED','IMAGE_TOO_LARGE'].includes(e.message) ? '已收到生成结果，但下载图片失败或图片超过 30 MB；请检查网络，不要连续重复生成。' : '生成服务暂时不可用，请检查网络或服务器配置。'}); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (Number(process.versions.node.split('.')[0]) < 18) {
    console.error(`Node.js ${process.versions.node} is too old. Install Node.js 22 or newer from https://nodejs.org/ and restart the terminal.`);
    process.exit(1);
  }
  createServer().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Chibi Studio listening on port ${process.env.PORT || 3000}`));
}
