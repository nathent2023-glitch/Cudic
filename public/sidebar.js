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

  // Servers icon
  icons.server='<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M7 8h4M7 12h10"/><circle cx="17" cy="8" r="1"/><circle cx="17" cy="12" r="1"/></svg>';

  var nav=document.createElement('nav');
  nav.className='sidebar';
  nav.innerHTML=''
    +'<div class="sidebar-top">'
      +'<div class="sidebar-brand">'
        +icons.cube
        +'<span class="sidebar-brand-text">glox<span class="dot">.</span></span>'
        +'<button class="sidebar-toggle" id="sidebarToggle" title="Toggle sidebar"><svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round"/></svg></button>'
      +'</div>'
      +'<div class="nav-section-label">Navigate</div>'
      +sbItem('/','home','home','Home')
      +sbItem('/chat','chat','chat','Chat')
      +sbItem('/servers','servers','server','Servers')
      +sbItem('/games','games','games','Games')
      +sbItem('/editor','editor','editor','Editor')
      +'<div id="serversSection" style="margin-top:16px">'
        +'<div class="nav-section-label" style="display:flex;align-items:center;justify-content:space-between">Your servers <span id="serverCount" style="font-size:0.7rem;color:var(--text-tertiary)">0/3</span></div>'
        +'<div id="serverList"></div>'
      +'</div>'
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

      // Fetch profile for user_id
      fetchProfile(s.access_token);
    }catch(e){}
  }

  async function fetchProfile(token){
    try{
      var apiHost=(typeof WS_URL!=='undefined'&&WS_URL)?WS_URL.replace(/^wss?:\/\//,'https://'):'';
      var res=await fetch(apiHost+'/api/profile',{headers:{'Authorization':'Bearer '+token}});
      var data=await res.json();
      if(data.profile){
        window.userProfile=data.profile;
        var nameEl=document.getElementById('sbName');
        var statusEl=document.getElementById('sbStatus');
        nameEl.textContent=data.profile.display_name;
        statusEl.textContent='#'+data.profile.user_id;
        nameEl.style.cursor='pointer';
        nameEl.title='Click to change display name';
        nameEl.addEventListener('click',function(){showNameEditor(data.profile.display_name)});
      }
    }catch(e){}
  }

  function showNameEditor(currentName){
    var nameEl=document.getElementById('sbName');
    var input=document.createElement('input');
    input.type='text';input.value=currentName;input.maxLength=24;
    input.style.cssText='background:var(--panel-raised);border:1px solid var(--signal);border-radius:var(--radius-sm);color:var(--text-primary);font-size:0.875rem;padding:2px 6px;width:100%;outline:none;font-family:inherit';
    var orig=nameEl.textContent;
    nameEl.textContent='';nameEl.appendChild(input);nameEl.style.cursor='default';input.focus();input.select();
    function done(){
      var val=input.value.trim();
      if(val&&val!==orig){
        nameEl.textContent=val;
        updateProfile(val);
      }else{
        nameEl.textContent=orig;nameEl.style.cursor='pointer';
      }
    }
    input.addEventListener('blur',done);
    input.addEventListener('keydown',function(e){if(e.key==='Enter')input.blur();if(e.key==='Escape'){input.value=orig;input.blur()}});
  }

  async function updateProfile(displayName){
    try{
      var apiHost=(typeof WS_URL!=='undefined'&&WS_URL)?WS_URL.replace(/^wss?:\/\//,'https://'):'';
      var raw=localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      if(!raw) return;
      var s=JSON.parse(raw);
      await fetch(apiHost+'/api/profile',{
        method:'PUT',
        headers:{'Authorization':'Bearer '+s.access_token,'Content-Type':'application/json'},
        body:JSON.stringify({display_name:displayName})
      });
    }catch(e){}
  }

  // Load servers
  loadServers();
  async function loadServers(){
    try{
      var raw=localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      var token=raw?JSON.parse(raw).access_token:null;
      var apiHost=(typeof WS_URL!=='undefined'&&WS_URL)?WS_URL.replace(/^wss?:\/\//,'https://'):'';
      var headers=token?{'Authorization':'Bearer '+token}:{};
      // My servers
      if(token){
        var res=await fetch(apiHost+'/api/servers/mine',{headers:headers});
        var data=await res.json();
        var myServers=data.servers||[];
        document.getElementById('serverCount').textContent=myServers.length+'/3';
        var list=document.getElementById('serverList');
        if(myServers.length){
          // Need username for lobby join
          var qs2=window.location.search;
          var up=new URLSearchParams(qs2);
          var uname=up.get('username')||(window.currentUser&&window.currentUser.name)||'';
          list.innerHTML=myServers.map(function(s){
            var lobby='server:'+s.id;
            var href='/chat?lobby='+encodeURIComponent(lobby)+(uname?'&username='+encodeURIComponent(uname):'');
            var active=(window.location.search.includes(lobby))?' active':'';
            return '<a class="sidebar-item'+active+'" href="'+href+'" style="font-size:0.85rem"><span style="width:20px;height:20px;border-radius:4px;background:var(--signal-tint);color:var(--signal);display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0">'+s.name.substring(0,2).toUpperCase()+'</span><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+s.name+'</span></a>';
          }).join('');
        } else {
          list.innerHTML='<div style="font-size:0.75rem;color:var(--text-tertiary);padding:6px 20px">No servers yet</div>';
        }
      } else {
        document.getElementById('serversSection').style.display='none';
      }
    }catch(e){}
  }

  window._reloadSidebarUser=loadSidebarUser;

  // Collapsible sidebar (sandwich sideways)
  var sidebarEl=document.querySelector('.sidebar');
  var toggleBtn=document.getElementById('sidebarToggle');
  if(localStorage.getItem('glox-sidebar-collapsed')==='1') sidebarEl.classList.add('collapsed');
  if(toggleBtn) toggleBtn.addEventListener('click',function(){
    sidebarEl.classList.toggle('collapsed');
    localStorage.setItem('glox-sidebar-collapsed',sidebarEl.classList.contains('collapsed')?'1':'0');
  });

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
