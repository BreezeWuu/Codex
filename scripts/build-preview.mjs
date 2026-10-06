import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const read = name => readFile(new URL(`public/${name}`, root), 'utf8');
const [html, css, js, svg] = await Promise.all(['page.template.html','style.css','app.js','sample.svg'].map(read));
const standalone = html
  .replace('<link rel="stylesheet" href="./style.css">', () => `<style>${css}</style>`)
  .replace('src="./sample.svg"', `src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"`)
  .replace('<script defer src="./app.js"></script>', () => `<script>${js.replaceAll('</script', '<\\/script')}</script>`);
await writeFile(new URL('index.html', root), standalone);
await writeFile(new URL('public/index.html', root), standalone);
console.log('Built standalone index.html: styles, script and sample image embedded. Real generation still requires the Node backend.');
