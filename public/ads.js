// ── Cudic ads ─────────────────────────────────────────────
// Companion to the inline Adsterra snippets inside `.ad-frame`
// slots. The snippets themselves are pasted inline (Adsterra
// banner scripts document.write, which only works parser-inserted
// — never inject them dynamically). This file only collapses
// slots that stay empty (ad-blocker, localhost domain-lock,
// network fail), so blocked ads leave no holes in the layout.
(function(){
  if(window._cudicAds)return;window._cudicAds=true;
  function check(){
    try{
      document.querySelectorAll('.ad-frame:not(.ad-empty),#studioAd:not(.ad-empty)').forEach(function(el){
        if(!el.querySelector('iframe'))el.classList.add('ad-empty');
      });
    }catch(e){}
  }
  function init(){
    // No early pass: slow fills must never be mistaken for blocked
    // slots (a collapsed slot can't earn). Two late passes catch
    // blockers, domain-locks and dead networks instead.
    setTimeout(check,5000);
    setTimeout(check,15000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);
  else init();
})();
