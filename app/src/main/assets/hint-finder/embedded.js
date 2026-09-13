(() => {
 const parentOrigin='https://game.bilibili.com';
 const update=()=>parent.postMessage({type:'uma-hints-overlay',open:Boolean(document.querySelector('dialog[open]'))||!document.querySelector('#skill-options').hidden},parentOrigin);
 new MutationObserver(update).observe(document.body,{subtree:true,attributes:true,attributeFilter:['open','hidden']});
 window.addEventListener('message',event=>{
  if(event.origin!==parentOrigin||event.source!==parent||event.data?.type!=='uma-hints-back')return;
  const dialog=document.querySelector('dialog[open]');
  if(dialog)dialog.close();else document.querySelector('#skill-input').blur();
  update();
 });
})();
