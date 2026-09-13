import {adaptHintFinder} from './adapt-hint-finder.mjs';
import {cp,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const source=new URL('../../hint-finder/dist/',import.meta.url);
const target=new URL('../app/src/main/assets/hint-finder/',import.meta.url);
// android.css belongs to this app and is preserved when refreshing the shared web assets.
await cp(source,target,{recursive:true});
const html=await readFile(new URL('index.html',target),'utf8');
await writeFile(new URL('index.html',target),html.replace('<script type="module" src="/app.mjs"></script>','<script type="module" src="/app.mjs"></script><script defer src="/embedded.js"></script>').replace('<link rel="stylesheet" href="/refinement.css">','<link rel="stylesheet" href="/refinement.css">\n  <link rel="stylesheet" href="/android.css">'));
await adaptHintFinder(target);
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:fileURLToPath(new URL('../',source)),encoding:'utf8'}).trim();
const data=JSON.parse(await readFile(new URL('data/cn.json',target),'utf8'));
await writeFile(new URL('PROVENANCE.json',target),JSON.stringify({source:'hint-finder/dist',revision,adaptation:'android.css, embedded.js and their HTML references; app.mjs adapted for touch, lower-skill highlights and embedded paging',dataSnapshot:data.meta.snapshotAt},null,2));
console.log('Bundled '+data.cards.length+' cards / '+data.skills.length+' skills from '+revision);
