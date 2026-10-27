import {readFile, writeFile, unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';

// PC owns shared data. Android owns content.js, mobile-ui.js, styles and back handling.
const root = new URL('../', import.meta.url);
const source = new URL('../../browser-extension/', import.meta.url);
const target = 'app/src/main/assets/hint-finder/';
const common = ['page-bridge.js', 'ranking.js', 'gold-skill-map.js', 'traditional-name-map.js', 'factor-recognizer.js', 'request-guard.js'];
const assets = ['app.mjs', 'search.mjs', 'style.css', 'refinement.css', 'assets/facets.svg', 'assets/favicon.svg', 'assets/horseshoes.svg', 'data/cn.json'];
const tests = ['factor-recognizer.test.cjs', 'ranking.test.cjs', 'request-guard.test.cjs', 'gold-skill-map.test.cjs', 'traditional-name-map.test.cjs', 'hint-finder.test.mjs'];
const updates = new Map();
const sourceHashes = {};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const [from, to] of [
  ...common.map(file => [file, file]),
  ...tests.map(file => ['tests/' + file, 'tests/' + file]),
  ...assets.map(file => ['hint-finder/' + file, target + file]),
  ['hint-finder/index.html', target + 'index.html']
]) {
  const bytes = await readFile(new URL(from, source));
  sourceHashes[from] = hash(bytes);
  updates.set(to, from === 'tests/hint-finder.test.mjs'
    ? Buffer.from(bytes.toString().replaceAll('../hint-finder/', '../app/src/main/assets/hint-finder/'))
    : bytes);
}

const data = JSON.parse(updates.get(target + 'data/cn.json'));
const previous = JSON.parse(await readFile(new URL(target + 'data/cn.json', root)));
if (data.meta?.server !== 'cn' || !Array.isArray(data.cards) || !Array.isArray(data.skills)
    || data.cards.length !== data.meta.cards || data.skills.length !== data.meta.skills) throw new Error('Invalid PC catalog');
const cardIds = new Set(data.cards.map(card => card.id));
const skillIds = new Set(data.skills.map(skill => skill.id));
if (cardIds.size !== data.cards.length || skillIds.size !== data.skills.length
    || data.cards.some(card => [...card.training, ...card.event].some(id => !skillIds.has(id)))) throw new Error('Invalid catalog identities');
const cutoff = Date.parse(data.meta.availableThrough + 'T23:59:59+08:00');
if (!Number.isFinite(cutoff) || data.cards.some(card => card.source === 'bwiki'
    && (!Number.isFinite(Date.parse(card.availableAt)) || Date.parse(card.availableAt) > cutoff))) throw new Error('Unreleased card in PC catalog');
const retained = new Map(data.cards.map(card => [card.id, card]));
if (previous.cards.filter(card => card.source !== 'bwiki').some(card => JSON.stringify(card) !== JSON.stringify(retained.get(card.id)))) throw new Error('Archived cards changed; review required');

let app = updates.get(target + 'app.mjs').toString();
// The upstream About paragraph may still describe an older catalog; use this snapshot's metadata.
app = app.replace(/保留工具箱 \d{4}-\d{2}-\d{2} 归档的 \d+ 张卡，按 BWIKI \d{4}-\d{2}-\d{2} 资料增补 \d+ 张卡；排除 \d+ 张标注未来日期或占位日期的卡。/u,
  () => `保留工具箱 ${(data.meta.originalSnapshotAt || data.meta.snapshotAt).slice(0,10)} 归档的 ${data.meta.originalCards} 张卡，按 BWIKI ${data.meta.availableThrough} 资料增补 ${data.meta.cards - data.meta.originalCards} 张卡；排除 ${data.meta.futureCardsExcluded} 张标注未来日期或占位日期的卡。`);
updates.set(target + 'app.mjs', Buffer.from(app));
let html = updates.get(target + 'index.html').toString();
if (!app.includes("$('#skill-search-button').addEventListener('click'")
    || !app.includes("$('#skill-options').addEventListener('mousedown'")
    || !app.includes('function updateTierView()')
    || !html.includes('href="./desktop.css"') || !html.includes('id="tier-switch"')) throw new Error('PC integration changed; review Android adaptation');
html = html.replace('href="./desktop.css"', 'href="./android.css"');
updates.set(target + 'index.html', Buffer.from(html));
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: fileURLToPath(source), encoding: 'utf8'}).trim();
const manifest = JSON.parse(await readFile(new URL('manifest.json', source)));
updates.set(target + 'PROVENANCE.json', Buffer.from(JSON.stringify({
  source: 'yyahz/umamusume-seed-optimizer', revision, pcVersion: manifest.version,
  adaptation: 'Android stylesheet, fixed-origin embedded messaging and mobile shell remain local; catalog metadata updates About text; test imports use Android assets',
  dataSnapshot: data.meta.snapshotAt, availableThrough: data.meta.availableThrough,
  cards: data.cards.length, skills: data.skills.length, sourceHashes
}, null, 2) + '\n'));

// Validate before writing; restore exact prior bytes if a write fails.
const originals = new Map(await Promise.all([...updates.keys()].map(async file => {
  try { return [file, await readFile(new URL(file, root))]; }
  catch (error) { if (error.code === 'ENOENT') return [file, null]; throw error; }
})));
try {
  for (const [file, bytes] of updates) {
    if (!originals.get(file) || !bytes.equals(originals.get(file))) await writeFile(new URL(file, root), bytes);
  }
} catch (error) {
  await Promise.all([...originals].map(([file, bytes]) => bytes
    ? writeFile(new URL(file, root), bytes)
    : unlink(new URL(file, root)).catch(error => { if (error.code !== 'ENOENT') throw error; })));
  throw error;
}
console.log(`Synced PC ${manifest.version}: ${data.cards.length} cards / ${data.skills.length} skills; Android shell preserved.`);
