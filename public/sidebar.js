// ── Glox Sidebar Component ──────────────────────────────
(function(){
  if(window._gloxSidebar) return; window._gloxSidebar=true;

  var page=document.body.getAttribute('data-page')||'home';

  // Apply saved prefs (personalization + performance) on every page
  try{
    var _acc=localStorage.getItem('glox_accent');
    if(_acc&&/^#[0-9a-fA-F]{6}$/.test(_acc)){
      var _c=[parseInt(_acc.slice(1,3),16),parseInt(_acc.slice(3,5),16),parseInt(_acc.slice(5,7),16)];
      var _hovers={'#774DCB':'#643BAD','#FF8C1A':'#E67A00','#2E9EDB':'#1F7FB8','#14A468':'#0E7A4E'};
      document.documentElement.style.setProperty('--signal',_acc);
      document.documentElement.style.setProperty('--signal-hover',_hovers[_acc]||_acc);
      document.documentElement.style.setProperty('--signal-tint','rgba('+_c[0]+','+_c[1]+','+_c[2]+',0.12)');
    }
    if(localStorage.getItem('glox_reduce_motion')==='1'){
      document.documentElement.classList.add('reduce-motion');
      var _st=document.createElement('style');
      _st.textContent='html.reduce-motion *,html.reduce-motion *::before,html.reduce-motion *::after{animation-duration:.001s!important;transition-duration:.001s!important}';
      document.head.appendChild(_st);
    }
  }catch(e){}

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
    +'<div class="sidebar-nav-card">'
      +'<div class="nav-section-label">Navigate</div>'
      +sbItem('/chat','chat','chat','Chat')
      +sbItem('/servers','servers','server','Servers')
      +sbItem('/games','games','games','Games')
      +'<div id="serversSection" style="margin-top:16px">'
        +'<div class="nav-section-label" style="display:flex;align-items:center;justify-content:space-between">Your servers <span id="serverCount" style="font-size:0.7rem;color:var(--text-tertiary)">0/3</span></div>'
        +'<div id="serverList"></div>'
      +'</div>'
      +'<div style="flex:1"></div>'
      +'<div class="sidebar-bottom">'
      +'<div class="account-row" id="accountRow" style="position:relative;cursor:pointer">'
        +'<div class="avatar" id="sbAvatar">?</div>'
        +'<div>'
          +'<div class="account-name" id="sbName">Guest</div>'
          +'<div class="account-status" id="sbStatus">Not signed in</div>'
        +'</div>'
        +'<div id="logoutBtn" style="display:none;position:absolute;right:0;bottom:100%;background:var(--panel-raised);border:1px solid var(--line);border-radius:var(--radius-sm);padding:8px 14px;font-size:0.75rem;color:var(--danger);cursor:pointer;white-space:nowrap;z-index:10;box-shadow:0 4px 12px rgba(0,0,0,0.15)" onmouseover="this.style.borderColor=\'var(--danger)\'" onmouseout="this.style.borderColor=\'var(--line)\'">Logout</div>'
      +'</div>'
    +'</div></div>';

  document.body.insertBefore(nav,document.body.firstChild);

  nav.querySelectorAll('.sidebar-item').forEach(function(el){
    if(el.getAttribute('data-p')===page) el.classList.add('active');
  });

  // Light-only theme: drop any legacy dark/light override
  document.documentElement.classList.remove('light-theme');
  try { localStorage.removeItem('glox-theme'); } catch (e) {}

  // Boot: finish OAuth callback first (GitHub lands on /lobbies with ?code=
  // or #access_token), then load user + servers so the session is visible
  // immediately. A failed handshake shows a toast instead of silent guest.
  (async function bootSidebar(){
    var attempted=false;
    try{
      var hasCode=window.location.search.indexOf('code=')!==-1;
      var hasHash=window.location.hash.indexOf('access_token')!==-1;
      if((hasCode||hasHash)&&typeof handleAuthCallback==='function'){attempted=true;await handleAuthCallback();}
    }catch(e){window._authError=(e&&e.message)||'Sign-in failed';}
    loadSidebarUser();
    loadServers();
    try{
      if(attempted&&!localStorage.getItem('sb-opimjwmgmzwapkzgxvhk-auth-token')){
        var diag=['cfg='+(typeof SUPABASE_URL!=='undefined'?'ok':'MISSING')];
        try{
          if(typeof getSupabase==='function'){
            var db2=await getSupabase();
            diag.push('db='+(!!db2));
            if(db2){var gs=await db2.auth.getSession();diag.push('sess='+!!(gs.data&&gs.data.session));if(gs.error)diag.push('sesserr='+gs.error.message);}
          }else{diag.push('no-authjs');}
        }catch(e3){diag.push('exc='+((e3&&e3.message)||e3));}
        var t=document.createElement('div');
        t.style.cssText='position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:var(--panel-raised);border:1px solid var(--danger);color:var(--text-primary);border-radius:10px;padding:12px 18px;font-size:0.85rem;z-index:9999;box-shadow:0 8px 30px rgba(0,0,0,.25);max-width:90vw;text-align:center';
        t.textContent='GitHub sign-in did not complete ('+diag.join(', ')+(window._authError?'; '+window._authError:'')+'). Please try again.';
        document.body.appendChild(t);
        setTimeout(function(){t.remove()},20000);
      }
    }catch(e2){}
  })();

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
      }
    }catch(e){}
  }

  // Load servers (called from bootSidebar above)
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

  // Show/hide logout on hover; click account row opens profile
  var accountRow=document.getElementById('accountRow');
  var logoutBtn=document.getElementById('logoutBtn');
  if(accountRow&&logoutBtn){
    accountRow.addEventListener('mouseenter',function(){logoutBtn.style.display='block'});
    accountRow.addEventListener('mouseleave',function(){logoutBtn.style.display='none'});
    accountRow.style.cursor='pointer';
    accountRow.addEventListener('click',function(){window.location.href='/profile'});
    logoutBtn.addEventListener('click',function(e){
      e.stopPropagation();
      localStorage.removeItem('sb-opimjwmgmzwapkzgxvhk-auth-token');
      window.location.href='/';
    });
  }
})();
