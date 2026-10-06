(async () => {
const $ = id => document.getElementById(id);
let imageData, mime, style = 'pixel', busy = false, configured = false, previewUrl;
const update = () => { $('generate').disabled = !imageData || busy || !configured; };
try { const response = await fetch('/api/status', {signal: AbortSignal.timeout(8000)}); if (!response.ok) throw new Error(); const status = await response.json(); configured = status.configured; if(status.transparentSupported === false) { $('background').querySelector('[value=transparent]').disabled=true; $('background').value='white'; } $('output-size').textContent='输出 '+(status.size || '1024 × 1024'); $('status').textContent = configured ? '图像服务凭据已配置 · 每次生成可能产生接口费用' : (status.message || '请配置图像服务并重启。'); } catch { $('status').textContent = '当前是静态预览：上传和风格选择可用，生成需要通过 npm start 启动后端，并配置 IMAGE_API_KEY。'; }
update();
async function loadFile(file) {
  if (!file || busy) return;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 12*1024*1024 || !file.size) { $('status').textContent = '请上传不超过 12 MB 的 PNG、JPG 或 WebP 图片。'; return; }
  const data = await new Promise((resolve,reject) => { const r = new FileReader(); r.onload=()=>resolve(r.result); r.onerror=reject; r.readAsDataURL(file); });
  const probe = new Image(); probe.src = data;
  try { await probe.decode(); } catch { $('status').textContent='图片无法解码，请选择有效图片。'; return; }
  mime=file.type; imageData=data.split(',')[1];
  if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl=URL.createObjectURL(file);
  $('source').src=previewUrl; $('source').hidden=false; $('upload-hint').hidden=true; $('replace').hidden=false;
  $('status').textContent=configured ? '参考图已就绪，选择风格后开始生成。' : '参考图已就绪；请配置 IMAGE_API_KEY 后重启服务器。'; update();
}
$('file').addEventListener('change',e=>loadFile(e.target.files[0]).catch(()=>{$('status').textContent='读取图片失败，请重试。';}));
const zone=$('dropzone'); zone.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('file').click();}});
for(const name of ['dragenter','dragover']) zone.addEventListener(name,e=>{e.preventDefault();zone.classList.add('dragging');});
zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');loadFile(e.dataTransfer.files[0]).catch(()=>{$('status').textContent='读取图片失败，请重试。';});});
document.querySelectorAll('[data-style]').forEach(b=>b.addEventListener('click',()=>{if(busy)return;style=b.dataset.style;document.querySelectorAll('[data-style]').forEach(x=>{x.classList.toggle('selected',x===b);x.setAttribute('aria-pressed',String(x===b));});}));
$('generate').addEventListener('click',async()=>{
  if(busy || !imageData || !configured)return;
  busy=true;update();$('loading').hidden=false; $('generate').textContent='正在生成…'; $('status').textContent='正在生成高清 Q 版角色，请保持页面打开。';
  const controls=document.querySelectorAll('input,textarea,select,.style');controls.forEach(c=>c.disabled=true);
  try{
    const response=await fetch('/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:imageData,mime,style,features:$('features').value,background:$('background').value}),signal:AbortSignal.timeout(260000)});
    const data=await response.json();if(!response.ok)throw new Error(data.error||'生成失败');
    $('result').src=data.image;$('result').alt='根据上传图片生成的 Q 版角色';$('download').href=data.image; $('download').download=data.mime==='image/jpeg'?'chibi-character.jpg':'chibi-character.png'; $('download').textContent=data.mime==='image/jpeg'?'↓ 下载 JPG':'↓ 下载 PNG';$('download').hidden=false;
    $('result-tag').textContent='生成完成';$('result-title').textContent='你的 Q 版角色已登场';$('result-note').textContent=(data.size || '1024 × 1024')+' · '+(data.mime==='image/jpeg'?'JPG':'PNG')+' · '+(style==='pixel'?'像素 Q 版':'插画 Q 版');$('status').textContent='生成完成，可以下载图片；也可以调整特征后重新生成。';
  }catch(e){$('status').textContent=e.name==='TimeoutError'?'请求超时，请稍后重试。':e.message;}
  finally{busy=false;$('loading').hidden=true;controls.forEach(c=>c.disabled=false);$('generate').innerHTML='✦ 生成我的 Q 版角色 <span>→</span>';update();}
});

})();
