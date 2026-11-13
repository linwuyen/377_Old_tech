import { readFile, mkdir, copyFile, cp } from 'node:fs/promises';
const source=new URL('../node_modules/katex/',import.meta.url);
const target=new URL('../vendor/katex/',import.meta.url);
const packageInfo=JSON.parse(await readFile(new URL('package.json',source),'utf8'));
if(packageInfo.version!=='0.19.1')throw new Error('Review and explicitly update the pinned KaTeX version before vendoring.');
await mkdir(target,{recursive:true});
// Keep the ES module source unchanged; .js is portable on static hosts.
await copyFile(new URL('dist/katex.mjs',source),new URL('katex.js',target));
await copyFile(new URL('dist/katex.min.css',source),new URL('katex.min.css',target));
await copyFile(new URL('LICENSE',source),new URL('LICENSE',target));
await cp(new URL('dist/fonts/',source),new URL('fonts/',target),{recursive:true});
console.log(`Vendored KaTeX ${packageInfo.version}, styles, fonts and MIT license.`);
