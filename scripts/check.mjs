import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
import { systemLessons } from '../lessons/system.js';
import { controlLessons } from '../lessons/control.js';
import { sourceExcerpts, equations } from '../lessons/shared.js';
import { diagramInfo, diagramSVG } from '../lessons/diagrams.js';
const root=new URL('../',import.meta.url);
const lessons=[...systemLessons,...controlLessons];
assert.equal(lessons.length,8,'Eight complete lessons are required');
assert.equal(new Set(lessons.map(l=>l.id)).size,8,'Lesson IDs must be unique');
assert.deepEqual(lessons.map(l=>Number(l.number)).sort((a,b)=>a-b),[1,2,3,4,5,6,7,8]);
const validIds=new Set([...lessons.map(l=>l.id),'','lab','sources']);
let citations=0;
for(const lesson of lessons){
  for(const key of ['id','number','title','summary','duration','category','body'])assert.ok(lesson[key],`${lesson.id} requires ${key}`);
  assert.ok((lesson.body.match(/<h2\b/g)||[]).length>=3,`${lesson.id} needs structured explanation`);
  assert.ok(lesson.body.includes('<details>'),`${lesson.id} needs a reading exercise`);
  assert.ok(lesson.body.includes('5262007b56d420c74ac892692ea4d3969a3e3992'),`${lesson.id} needs pinned source citations`);
  assert.ok(!/<script\b|javascript:/i.test(lesson.body),'Unexpected active content');
  for(const match of lesson.body.matchAll(/href="#\/([^"?]*)/g))assert.ok(validIds.has(match[1]),`Broken route ${match[1]}`);
  for(const match of lesson.body.matchAll(/https:\/\/github\.com\/linwuyen\/ASR5K_Old\/blob\/5262007b56d420c74ac892692ea4d3969a3e3992\/ASR5K_28377\/TRACE_ASR5000_F28377S\/([^"#]+)#L(\d+)(?:-L(\d+))?/g)){
    citations++;
    if(process.argv[2]){
      const text=await readFile(resolve(process.argv[2],decodeURIComponent(match[1])),'utf8');
      const lines=text.split('\n').length;const start=Number(match[2]),end=Number(match[3]||start);
      assert.ok(start>0&&end>=start&&end<=lines,`Invalid source range ${match[1]}:${start}-${end} (${lines} lines)`);
    }
  }
}
for(const file of ['index.html','styles.css','deep-content.css','app.js','lab.js','favicon.svg','.nojekyll','vendor/katex/katex.js','vendor/katex/katex.min.css','vendor/katex/LICENSE'])await access(new URL(file,root));
const html=await readFile(new URL('index.html',root),'utf8');
assert.ok(html.includes('lang="zh-Hant"'));
for(const [,file] of html.matchAll(/(?:href|src)="\.\/([^"#]+)"/g))await access(new URL(file,root));
for(const excerpt of sourceExcerpts){
  const shown=excerpt.code.replace(/\r\n/g,'\n').split('\n');
  assert.equal(shown.length,excerpt.end-excerpt.start+1,`${excerpt.path}:${excerpt.start} code line labels must match source range`);
  if(process.argv[2]){
    const original=(await readFile(resolve(process.argv[2],excerpt.path),'utf8')).split(/\r?\n/).slice(excerpt.start-1,excerpt.end);
    assert.deepEqual(shown.map(line=>line.trim()),original.map(line=>line.trim()),`${excerpt.path}:${excerpt.start} displayed source must match original`);
  }
}
for(const name of Object.keys(diagramInfo)){
  const svg=diagramSVG(name,`check-${name}`);
  assert.ok(!/undefined|NaN/.test(svg),`${name} diagram contains invalid coordinates`);
  assert.ok(svg.includes('<title')&&svg.includes('<desc'),`${name} diagram needs text alternatives`);
}
const fontCSS=await readFile(new URL('vendor/katex/katex.min.css',root),'utf8');
for(const [,path]of fontCSS.matchAll(/url\(([^)]+)\)/g))await access(new URL(`vendor/katex/${path.replace(/["']/g,'')}`,root));
console.log(`Verified ${lessons.length} lessons, ${citations} citations, ${equations.length} strict-rendered formulas, ${Object.keys(diagramInfo).length} diagrams, ${sourceExcerpts.length} line-numbered excerpts and local fonts/assets.${process.argv[2]?' All source paths/ranges and displayed code match the original.':''}`);
