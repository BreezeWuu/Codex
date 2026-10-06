import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, makePrompt } from '../server.mjs';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ioAAAAASUVORK5CYII=';
async function running(t, options) { const s=createServer(options); await new Promise(r=>s.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>s.close(r)));return `http://127.0.0.1:${s.address().port}`; }
const post=(url,body)=>fetch(url+'/api/generate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
test('page assets load; missing credential is explicitly reported',async t=>{
 const url=await running(t,{env:{}});
 for(const path of ['/','/app.js','/style.css','/sample.svg'])assert.equal((await fetch(url+path)).status,200);
 assert.equal((await (await fetch(url+'/api/status')).json()).configured,false);
 assert.equal((await post(url,{})).status,503);
 assert.equal((await fetch(url+'/../server.mjs')).status,404);
});
test('real generation request uses reference image, selected style and server-side key',async t=>{
 let called=0;
 const url=await running(t,{env:{IMAGE_API_KEY:'test-secret'},fetchImpl:async(endpoint,options)=>{
  called++; assert.equal(endpoint,'https://api.openai.com/v1/images/edits');assert.equal(options.headers.Authorization,'Bearer test-secret');
  assert.equal(options.body.get('image').type,'image/png'); assert.equal(options.body.get('background'),'transparent');
  assert.match(options.body.get('prompt'),/Pixel art/);assert.match(options.body.get('prompt'),/silver hair/);
  return Response.json({data:[{b64_json:png}]});
 }});
 const response=await post(url,{image:png,mime:'image/png',style:'pixel',background:'transparent',features:'silver hair'});
 assert.equal(response.status,200);assert.equal((await response.json()).image,`data:image/png;base64,${png}`);assert.equal(called,1);
});
test('malformed images, wrong MIME and invalid options never call model',async t=>{
 const url=await running(t,{env:{IMAGE_API_KEY:'test'},fetchImpl:()=>{throw Error('must not call');}});
 for(const body of [{image:'garbage',mime:'image/png'},{image:png,mime:'image/jpeg'},{image:png,mime:'image/png',style:'unknown'},{image:png,mime:'image/png',background:'unknown'}])assert.equal((await post(url,body)).status,400);
});
test('upstream errors do not expose credential or raw service details',async t=>{
 const url=await running(t,{env:{IMAGE_API_KEY:'test-secret'},fetchImpl:async()=>new Response('sensitive test-secret',{status:401})});
 const response=await post(url,{image:png,mime:'image/png'});assert.equal(response.status,502);assert.doesNotMatch(await response.text(),/test-secret|sensitive/);
});
test('prompt includes recognition constraints and both supported styles',()=>{
 assert.match(makePrompt({style:'illustration'}),/cel shading/);assert.match(makePrompt({}),/jersey number/);assert.match(makePrompt({}),/Do not invent weapons/);
});
test('Ark adapter sends JSON image-to-image and reports JPEG output',async t=>{
 const url=await running(t,{env:{IMAGE_PROVIDER:'ark',ARK_API_KEY:'test',IMAGE_MODEL:'test-image-model'},fetchImpl:async(endpoint,options)=>{
  assert.equal(endpoint,'https://ark.cn-beijing.volces.com/api/v3/images/generations');
  const body=JSON.parse(options.body);assert.equal(body.model,'test-image-model');assert.equal(body.image,`data:image/png;base64,${png}`);assert.equal(body.size,'2K');assert.equal(body.response_format,'url');
  return Response.json({data:[{b64_json:Buffer.from([255,216,255]).toString('base64')}]});
 }});
 assert.equal((await (await fetch(url+'/api/status')).json()).transparentSupported,false);
 const response=await post(url,{image:png,mime:'image/png'});assert.equal(response.status,200);assert.equal((await response.json()).mime,'image/jpeg');
 assert.equal((await post(url,{image:png,mime:'image/png',background:'transparent'})).status,400);
});
test('Ark requires an explicitly configured image model',async t=>{
 const url=await running(t,{env:{ARK_API_KEY:'test'}});
 assert.equal((await (await fetch(url+'/api/status')).json()).configured,false);
 assert.equal((await post(url,{})).status,503);
});
test('Ark URL result is downloaded without API key and returned as image data',async t=>{
 let calls=0;
 const url=await running(t,{env:{ARK_API_KEY:'test-secret',IMAGE_MODEL:'test-model'},fetchImpl:async(endpoint,options)=>{
  calls++;
  if(calls===1) return Response.json({data:[{url:'https://images.tos-cn-beijing.volces.com/result.png?signature=private',size:'2048x2048'}]});
  assert.equal(options.headers,undefined);assert.equal(options.redirect,'error');
  return new Response(Buffer.from(png,'base64'));
 }});
 const response=await post(url,{image:png,mime:'image/png'});assert.equal(response.status,200);
 const body=await response.json();assert.equal(body.image,`data:image/png;base64,${png}`);assert.equal(body.size,'2048x2048');assert.equal(calls,2);
});
test('structured parameter error is shown with credential and signed URL redacted',async t=>{
 const url=await running(t,{env:{ARK_API_KEY:'test-secret',IMAGE_MODEL:'test-model'},fetchImpl:async()=>Response.json({error:{message:'Invalid response_format test-secret https://example.com/image?signature=private'}},{status:400})});
 const response=await post(url,{image:png,mime:'image/png'});const body=await response.json();assert.equal(response.status,502);
 assert.match(body.error,/Invalid response_format/);assert.doesNotMatch(body.error,/test-secret|signature=private/);
});
test('generated URL cannot trigger an arbitrary internal network fetch',async t=>{
 let calls=0;
 const url=await running(t,{env:{ARK_API_KEY:'test',IMAGE_MODEL:'test-model'},fetchImpl:async()=>{calls++;return Response.json({data:[{url:'https://127.0.0.1/image'}]});}});
 assert.equal((await post(url,{image:png,mime:'image/png'})).status,502);assert.equal(calls,1);
});
