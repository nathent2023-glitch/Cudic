// ── Glox Fluid Animations (GSAP) ──────────────────────────────
(function(){
  function loadGsap(cb){
    if(window.gsap) return cb();
    var s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js';
    s.onload=cb;
    document.head.appendChild(s);
  }

  loadGsap(function(){
    var ease="power3.out";
    var longEase="expo.out";

    // Sidebar nav stagger
    gsap.from(".sidebar-item", { y: 10, opacity: 0, duration: 0.6, ease: ease, stagger: 0.04, clearProps: "all" });
    gsap.from(".sidebar-brand", { y: -8, opacity: 0, duration: 0.7, ease: ease });

    // Cards stagger (servers, games, lobbies)
    function staggerCards(sel){
      var cards=document.querySelectorAll(sel);
      if(!cards.length) return;
      gsap.fromTo(cards, { y: 18, opacity: 0, scale: 0.96 }, { y: 0, opacity: 1, scale: 1, duration: 0.65, ease: ease, stagger: 0.06, clearProps: "all" });
    }
    // Run after a tick to catch dynamically loaded cards
    setTimeout(function(){
      staggerCards(".server-card");
      staggerCards(".game-card");
      staggerCards(".lobby-item");
    }, 300);
    // Also observe for new cards (servers/games load async)
    var obs=new MutationObserver(function(){ staggerCards(".server-card"); staggerCards(".game-card"); });
    obs.observe(document.body, { childList: true, subtree: true });

    // Topbar slide
    gsap.from(".topbar", { y: -10, opacity: 0, duration: 0.6, ease: ease, clearProps: "all" });

    // Chat messages - animate as they appear
    var msgObs=new MutationObserver(function(muts){
      muts.forEach(function(m){
        m.addedNodes.forEach(function(n){
          if(n.classList && (n.classList.contains('msg') || n.classList.contains('system'))){
            gsap.from(n, { y: 8, opacity: 0, duration: 0.45, ease: ease });
          }
        });
      });
    });
    var msgEl=document.getElementById('messages');
    if(msgEl) msgObs.observe(msgEl, { childList: true });

    // Fluid hover for cards & buttons
    function fluidHover(sel){
      document.querySelectorAll(sel).forEach(function(el){
        el.addEventListener('mouseenter', function(){ gsap.to(el, { scale: 1.02, duration: 0.35, ease: "power2.out" }); });
        el.addEventListener('mouseleave', function(){ gsap.to(el, { scale: 1, duration: 0.4, ease: longEase }); });
      });
    }
    setTimeout(function(){
      fluidHover(".server-card");
      fluidHover(".game-card");
      fluidHover(".btn");
      fluidHover(".btn-primary");
    }, 500);

    // Sidebar smooth expand (override CSS width transition with GSAP for extra fluid)
    var sidebar=document.querySelector('.sidebar');
    if(sidebar){
      sidebar.style.transition='none';
      sidebar.addEventListener('mouseenter', function(){ gsap.to(sidebar, { width: 220, duration: 0.45, ease: "power3.inOut", overwrite: true }); });
      sidebar.addEventListener('mouseleave', function(){ gsap.to(sidebar, { width: 72, duration: 0.45, ease: "power3.inOut", overwrite: true }); });
    }

    // Modal fluid open
    var modals=document.querySelectorAll('.modal-overlay');
    modals.forEach(function(overlay){
      var modal=overlay.querySelector('.modal');
      if(!modal) return;
      var mo=new MutationObserver(function(){
        if(overlay.classList.contains('open')){
          gsap.fromTo(overlay, { opacity: 0 }, { opacity: 1, duration: 0.3, ease: ease });
          gsap.fromTo(modal, { y: 16, scale: 0.96, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5, ease: longEase });
        }
      });
      mo.observe(overlay, { attributes: true, attributeFilter: ['class'] });
    });

    // Auth / form fluid
    gsap.from(".auth-form-panel, .auth-brand, .servers-content, .games-content", { y: 12, opacity: 0, duration: 0.7, ease: ease, clearProps: "all" });
  });
})();
