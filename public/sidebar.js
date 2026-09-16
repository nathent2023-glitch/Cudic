// ── Glox Sidebar Component ──────────────────────────────
// Usage: <link rel="stylesheet" href="/sidebar.css"> then <script src="/sidebar.js"></script>
// Set data-page="home|chat|games|editor" on <body> to highlight current page
(function(){
  if(window._gloxSidebar) return; window._gloxSidebar=true;

  var page=document.body.getAttribute('data-page')||'home';

  var nav=document.createElement('nav');
  nav.className='sidebar';
  nav.innerHTML=''
    +'<div class="sidebar-logo">glox<span>.</span></div>'
    +'<div class="sidebar-section">'
      +'<div class="sidebar-label-text">Navigate</div>'
      +sidebarItem('/','home','🏠','Home')
      +sidebarItem('/chat','chat','💬','Chat')
      +sidebarItem('/games','games','🎮','Games')
      +sidebarItem('/editor','editor','🔧','Editor')
    +'</div>'
    +'<div class="sidebar-spacer"></div>'
    +'<div class="sidebar-divider"></div>'
    +'<div class="sidebar-section">'
      +'<div class="sidebar-label-text">Account</div>'
      +'<div class="sidebar-theme" id="sidebarTheme">'
        +'<div class="si-icon">🌓</div>'
        +'<span class="sidebar-theme-label">Dark mode</span>'
        +'<div class="theme-toggle" id="themeToggleBtn"></div>'
      +'</div>'
    +'</div>'
    +'<div class="sidebar-user" id="sidebarUser">'
      +'<div class="sidebar-avatar" id="sbAvatar">?</div>'
      +'<div class="sidebar-user-info">'
        +'<div class="sidebar-user-name" id="sbName">Guest</div>'
        +'<div class="sidebar-user-status" id="sbStatus">not signed in</div>'
      +'</div>'
    +'</div>';

  var layout=document.createElement('div');
  layout.className='app-layout';

  // Insert sidebar + wrapper before body children
  var firstChild=document.body.firstChild;
  document.body.insertBefore(nav,firstChild);
  var wrapper=document.createElement('div');
  wrapper.className='app-main';
  // Move all existing children (except the scripts we just added) into wrapper
  while(document.body.firstChild!==nav){
    if(document.body.firstChild===wrapper) break;
    wrapper.appendChild(document.body.firstChild);
  }
  document.body.appendChild(wrapper);

  // Highlight active page
  nav.querySelectorAll('.sidebar-item').forEach(function(el){
    if(el.getAttribute('data-p')===page) el.classList.add('active');
  });

  // Load user info
  loadSidebarUser();

  // Theme toggle
  var toggle=document.getElementById('themeToggleBtn');
  var label=document.querySelector('.sidebar-theme-label');
  var saved=localStorage.getItem('glox-theme');
  if(saved==='light'){
    document.documentElement.classList.add('light-theme');
    toggle.classList.add('on');
    if(label) label.textContent='Light mode';
  }
  toggle.addEventListener('click',function(){
    var isLight=document.documentElement.classList.toggle('light-theme');
    toggle.classList.toggle('on',isLight);
    if(label) label.textContent=isLight?'Light mode':'Dark mode';
    localStorage.setItem('glox-theme',isLight?'light':'dark');
  });

  function sidebarItem(href,key,icon,text){
    return '<a class="sidebar-item" data-p="'+key+'" href="'+href+'">'
      +'<div class="si-icon">'+icon+'</div>'
      +'<span class="si-text">'+text+'</span></a>';
  }

  function loadSidebarUser(){
    try{
      var raw=localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      if(!raw) return;
      var s=JSON.parse(raw);
      if(!s||!s.access_token) return;
      // Decode JWT payload
      var parts=s.access_token.split('.');
      if(parts.length<2) return;
      var payload=JSON.parse(atob(parts[1]));
      var name=payload.user_metadata?.full_name||payload.user_metadata?.name||payload.email||'User';
      var initials=name.split(' ').map(function(w){return w[0]}).join('').substring(0,2).toUpperCase();
      document.getElementById('sbAvatar').textContent=initials;
      document.getElementById('sbName').textContent=name;
      document.getElementById('sbStatus').textContent='signed in';
      document.getElementById('sbStatus').style.color='#10d275';
      window.currentToken=s.access_token;
      window.currentUser={id:payload.sub,email:payload.email,name:name};
    }catch(e){}
  }

  window._reloadSidebarUser=loadSidebarUser;
})();
