import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const MAX_IMAGE = 12 * 1024 * 1024;
const styles = { pixel: 'Pixel art sprite, crisp square pixels, bold black outlines, limited harmonious palette, no blur or anti-aliasing.', illustration: 'Clean chibi anime illustration, expressive eyes, crisp linework, soft cel shading.' };
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
        const upstream = await fetchImpl(`${base}/images/${ark ? 'generations' : 'edits'}`, {method:'POST', headers:{Authorization:`Bearer ${key}`, ...(ark ? {'Content-Type':'application/json'} : {})}, body:ark ? JSON.stringify({model, prompt, image:`data:${body.mime};base64,${bytes.toString('base64')}`, size:'2K', response_format:'b64_json', watermark:false}) : form, signal:AbortSignal.timeout(240000)});
        if (!upstream.ok) { await upstream.text(); return send(res, 502, {error: `图像服务返回 ${upstream.status}。请检查密钥、额度以及接口是否支持图像编辑。`}); }
        const result = await upstream.json();
        if (!result.data?.[0]?.b64_json) return send(res, 502, {error:'图像服务没有返回 PNG 图像数据，请使用支持 b64_json 输出的图像编辑接口。'});
        const encoded = result.data[0].b64_json;
        const outputMime = Buffer.from(encoded, 'base64')[0] === 255 ? 'image/jpeg' : 'image/png';
        return send(res, 200, { image: `data:${outputMime};base64,${encoded}`, mime:outputMime, size:ark ? '2K' : '1024 × 1024' });
      }
      const files = {'/':'index.html', '/app.js':'app.js', '/style.css':'style.css', '/sample.svg':'sample.svg'};
      if (req.method !== 'GET' || !files[req.url]) return send(res,404,{error:'Not found'});
      const name = files[req.url]; const data = await readFile(new URL(`./public/${name}`, import.meta.url));
      res.writeHead(200, {'Content-Type':name.endsWith('.html')?'text/html; charset=utf-8':name.endsWith('.css')?'text/css':name.endsWith('.svg')?'image/svg+xml':'text/javascript', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'same-origin'}); res.end(data);
    } catch(e) { send(res,502,{error: e.name === 'TimeoutError' ? '生成超时，请稍后重试。' : '生成服务暂时不可用，请检查网络或服务器配置。'}); }
  });
}
if (process.argv[1] === fileURLToPath(import.meta.url)) createServer().listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log(`Chibi Studio listening on port ${process.env.PORT || 3000}`));
