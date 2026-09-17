// ── Glox Sidebar Component ──────────────────────────────
(function(){
  if(window._gloxSidebar) return; window._gloxSidebar=true;

  var page=document.body.getAttribute('data-page')||'home';

  var icons={
    home:'<svg viewBox="0 0 24 24"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9"/></svg>',
    chat:'<svg viewBox="0 0 24 24"><path d="M4 5h16v11H9l-4 4V5Z"/></svg>',
    games:'<svg viewBox="0 0 24 24"><rect x="3" y="8" width="18" height="9" rx="3"/><path d="M8 11v3M6.5 12.5h3M16 12h.01M18 14h.01"/></svg>',
    editor:'<svg viewBox="0 0 24 24"><path d="M14 4 20 10 8 22H4v-4L16 6Z"/></svg>',
    cube:'<svg viewBox="0 0 24 24"><path d="M12 3 4 7v10l8 4 8-4V7L12 3Z"/><path d="M4 7l8 4 8-4M12 11v10"/></svg>'
  };

  var qs=window.location.search;
  function sbItem(href,key,icon,label){
    var dest=href+(key!=='home'?qs:'');
    return '<a class="sidebar-item" data-p="'+key+'" href="'+dest+'">'
      +icons[icon]+'<span>'+label+'</span></a>';
  }

  var nav=document.createElement('nav');
  nav.className='sidebar';
  nav.innerHTML=''
    +'<div class="sidebar-top">'
      +'<div class="sidebar-brand">'
        +icons.cube
        +'<span class="sidebar-brand-text">glox<span class="dot">.</span></span>'
      +'</div>'
      +'<div class="nav-section-label">Navigate</div>'
      +sbItem('/','home','home','Home')
      +sbItem('/chat','chat','chat','Chat')
      +sbItem('/games','games','games','Games')
      +sbItem('/editor','editor','editor','Editor')
    +'</div>'
    +'<div class="sidebar-bottom">'
      +'<div class="mode-row">'
        +'<span id="themeLabel">Light mode</span>'
        +'<div class="switch" id="themeToggleBtn"></div>'
      +'</div>'
      +'<div class="account-row" id="accountRow" style="position:relative;cursor:pointer">'
        +'<div class="avatar" id="sbAvatar">?</div>'
        +'<div>'
          +'<div class="account-name" id="sbName">Guest</div>'
          +'<div class="account-status" id="sbStatus">Not signed in</div>'
        +'</div>'
        +'<div id="logoutBtn" style="display:none;position:absolute;right:0;top:-8px;background:var(--panel-raised);border:1px solid var(--line);border-radius:var(--radius-sm);padding:4px 10px;font-size:0.75rem;color:var(--danger);cursor:pointer;white-space:nowrap;z-index:10" onmouseover="this.style.borderColor=\'var(--danger)\'" onmouseout="this.style.borderColor=\'var(--line)\'">Logout</div>'
      +'</div>'
    +'</div>';

  document.body.insertBefore(nav,document.body.firstChild);

  nav.querySelectorAll('.sidebar-item').forEach(function(el){
    if(el.getAttribute('data-p')===page) el.classList.add('active');
  });

  // Theme toggle
  var toggle=document.getElementById('themeToggleBtn');
  var label=document.getElementById('themeLabel');
  var saved=localStorage.getItem('glox-theme');
  if(saved==='light'){
    document.documentElement.classList.add('light-theme');
    toggle.classList.add('on');
    if(label) label.textContent='Dark mode';
  }
  toggle.addEventListener('click',function(){
    var isLight=document.documentElement.classList.toggle('light-theme');
    toggle.classList.toggle('on',isLight);
    if(label) label.textContent=isLight?'Dark mode':'Light mode';
    localStorage.setItem('glox-theme',isLight?'light':'dark');
  });

  // Load user info
  loadSidebarUser();

  function loadSidebarUser(){
    try{
      var raw=localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      if(!raw) return;
      var s=JSON.parse(raw);
      if(!s||!s.access_token) return;
      var parts=s.access_token.split('.');
      if(parts.length<2) return;
      var payload=JSON.parse(atob(parts[1]));
      var name=payload.user_metadata?.full_name||payload.user_metadata?.name||payload.email||'User';
      var initials=name.split(' ').map(function(w){return w[0]}).join('').substring(0,2).toUpperCase();
      document.getElementById('sbAvatar').textContent=initials;
      document.getElementById('sbName').textContent=name;
      document.getElementById('sbStatus').textContent='Signed in';
      window.currentToken=s.access_token;
      window.currentUser={id:payload.sub,email:payload.email,name:name};
    }catch(e){}
  }

  window._reloadSidebarUser=loadSidebarUser;

  // Show/hide logout on hover
  var accountRow=document.getElementById('accountRow');
  var logoutBtn=document.getElementById('logoutBtn');
  if(accountRow&&logoutBtn){
    accountRow.addEventListener('mouseenter',function(){logoutBtn.style.display='block'});
    accountRow.addEventListener('mouseleave',function(){logoutBtn.style.display='none'});
    logoutBtn.addEventListener('click',function(e){
      e.stopPropagation();
      localStorage.removeItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      window.location.href='/';
    });
  }
})();
