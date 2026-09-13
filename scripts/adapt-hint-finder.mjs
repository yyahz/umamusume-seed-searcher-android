import {readFile,writeFile} from 'node:fs/promises';
export async function adaptHintFinder(target) {
 const file=new URL('app.mjs',target);let source=await readFile(file,'utf8');
 const patch=(from,to)=>{if(!source.includes(from))throw new Error('Skill adapter needs review: '+from);source=source.replace(from,to);};
 patch("state.selected.includes(groupId(id)) ? ' match' : ''", "(state.selected.includes(groupId(id)) || skills.get(state.selected[0])?.lowerSkills?.some(s=>groupId(s.id)===groupId(id))) ? ' match' : ''");
 patch("$('#skill-options').addEventListener('pointerdown',e=>e.preventDefault());", "$('#skill-options').addEventListener('pointerdown',e=>e.preventDefault());\n// Older Android WebViews still synthesize mousedown after touch; keep focus until click.\n$('#skill-options').addEventListener('mousedown',e=>e.preventDefault());");
 patch("$('#results-heading').focus({preventScroll:true});$('#results-heading').scrollIntoView({block:'start'});", "($('#gold-heading').hidden ? $('#results') : $('#gold-heading')).scrollIntoView({block:'start'});");
 patch("let lastFocus, toastTimeout;", "let lastFocus, toastTimeout;\nlet resultTier = 'gold', tierSkill = null;");
 patch("  syncFilters();", "  if (tierSkill !== state.selected[0]) { resultTier = 'gold'; tierSkill = state.selected[0]; }\n  syncFilters();");
 patch("function closeSuggestions() {", `function updateTierView() {
  const sections=findCardSections(data.cards,state,groups);
  const isGold=sections.target?.rarity===2;
  $('#tier-switch').hidden=!isGold;
  $('#direct-section').hidden=isGold && resultTier==='lower';
  $('#lower-section').hidden=!isGold || resultTier!=='lower';
  document.querySelectorAll('[data-result-tier]').forEach(button=>{
    const selected=button.dataset.resultTier===resultTier;
    button.setAttribute('aria-selected',String(selected));
    button.tabIndex=selected?0:-1;
    button.textContent=button.dataset.resultTier==='gold'?'金技能（'+sections.direct.length+'）':'下位白技能（'+sections.lower.length+'）';
  });
  if(isGold){
    const names=[...new Set(sections.lowerSkills.map(s=>familyName(s.name)))].join('、');
    $('#lower-heading').textContent=names?'下位白技能 · '+names:'暂无下位白技能资料';
    $('#lower-description').textContent='不能获取上位金技能「'+sections.target.name+'」。';
  }
}
function closeSuggestions() {`);
 patch("  $('#results-end').textContent =", "  updateTierView();\n  $('#results-end').textContent =");
 patch("$('#about-button').addEventListener('click',showAbout);", `$('#tier-switch').addEventListener('click',event=>{const button=event.target.closest('[data-result-tier]');if(!button)return;resultTier=button.dataset.resultTier;render(false);});
$('#tier-switch').addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();resultTier=event.key==='Home'?'gold':event.key==='End'?'lower':resultTier==='gold'?'lower':'gold';render(false);document.querySelector('[data-result-tier="'+resultTier+'"]').focus();});
$('#about-button').addEventListener('click',showAbout);`);
 patch("$('#skill-input').addEventListener('input',suggest);", `$('#skill-search-button').addEventListener('mousedown',event=>event.preventDefault());
$('#skill-search-button').addEventListener('click',()=>{
  if(!data)return;
  const query=familyName($('#skill-input').value);
  if(!query){$('#skill-input').focus();suggest();return;}
  suggest();
  const exact=suggestions.find(s=>familyName(s.name)===query);
  const chosen=exact || (suggestions.length===1?suggestions[0]:null);
  if(chosen){addSkill(chosen.id);$('#skill-input').blur();}
  else {$('#skill-input').focus();suggest();toast('请从候选列表选择具体技能');}
});
$('#skill-input').addEventListener('input',suggest);`);
 await writeFile(file,source);
 const htmlFile=new URL('index.html',target);let html=await readFile(htmlFile,'utf8');
 html=html.replace('<kbd aria-hidden="true">↵</kbd>','<button type="button" id="skill-search-button" aria-label="搜索技能">搜索</button>');
 html=html.replace('id="skill-input" placeholder=','id="skill-input" enterkeyhint="search" placeholder=');
 html=html.replace(/        <nav class="pagination" aria-label="支援卡顶部分页"[^\n]+\n/,'');
 html=html.replace(/          <nav class="lower-pagination pagination" aria-label="下位白技能支援卡分页"[^\n]+\n/,'');
 html=html.replace('<div id="gold-heading"','<div id="direct-section"><div id="gold-heading"');
 html=html.replace('<section id="lower-section"','</div><section id="lower-section"');
 html=html.replace('<div class="side-footnote">','<div id="tier-switch" role="tablist" aria-label="技能级别" hidden><button type="button" role="tab" data-result-tier="gold" aria-controls="direct-section" aria-selected="true">金技能</button><button type="button" role="tab" data-result-tier="lower" aria-controls="lower-section" aria-selected="false" tabindex="-1">下位白技能</button></div><div class="side-footnote">');
 await writeFile(htmlFile,html);
}
