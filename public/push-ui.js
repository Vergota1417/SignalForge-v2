(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const TEST_TOKEN_KEY='signalforge_push_test_token_v1';
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);

  function ensureUi(){
    if($('pushAlertsBtn')) return $('pushAlertsBtn');
    const actions=document.querySelector('.top-actions');
    if(!actions) return null;
    const btn=document.createElement('button');
    btn.id='pushAlertsBtn';btn.type='button';btn.className='btn ghost push-alert-btn';btn.textContent='Alerts';
    actions.appendChild(btn);
    const test=document.createElement('button');
    test.id='pushTestBtn';test.type='button';test.className='btn ghost push-test-btn';test.textContent='Test Alert';test.hidden=true;
    actions.appendChild(test);
    const note=document.createElement('div');note.id='pushAlertNote';note.className='push-alert-note';note.hidden=true;actions.appendChild(note);
    return btn;
  }

  async function api(path,options={}){
    const res=await fetch(path,{...options,headers:{'content-type':'application/json',accept:'application/json',...(options.headers||{})}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok){const err=new Error(body.error||`HTTP ${res.status}`);err.status=res.status;err.body=body;throw err;}
    return body;
  }

  function decodeKey(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
  }

  function testToken(){
    let token=localStorage.getItem(TEST_TOKEN_KEY)||'';
    if(/^[A-Za-z0-9_-]{32,128}$/.test(token))return token;
    const bytes=new Uint8Array(32);crypto.getRandomValues(bytes);
    token=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    localStorage.setItem(TEST_TOKEN_KEY,token);return token;
  }

  function showNote(message,isError=false){
    const note=$('pushAlertNote');if(!note)return;
    note.textContent=message;note.hidden=false;note.dataset.error=isError?'1':'0';
    clearTimeout(showNote.timer);showNote.timer=setTimeout(()=>{note.hidden=true;},7000);
  }

  async function currentSubscription(){
    const reg=await navigator.serviceWorker.ready;
    return reg.pushManager.getSubscription();
  }

  async function syncSubscription(sub){
    if(!sub)return;
    await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON(),testToken:testToken()})});
  }

  async function refreshButton(config=null){
    const btn=ensureUi(),test=$('pushTestBtn');if(!btn)return;
    if(!supported()){btn.hidden=true;if(test)test.hidden=true;return;}
    const cfg=config||await api('/api/push/config');
    if(!cfg.configured){btn.textContent='Alerts Setup';btn.title='Push alert keys are not configured';btn.disabled=true;if(test)test.hidden=true;return;}
    const sub=await currentSubscription();
    btn.disabled=false;btn.textContent=sub?'Alerts On':'Alerts Off';btn.title=sub?'Tap to disable phone alerts':'Tap to enable phone alerts';btn.setAttribute('aria-label',btn.title);btn.dataset.enabled=sub?'1':'0';
    if(test){test.hidden=!sub;test.disabled=false;test.textContent='Test Alert';test.title='Send a test phone alert';}
    if(sub) await syncSubscription(sub);
  }

  async function enableAlerts(){
    if(!supported()) throw new Error('Push notifications are not supported on this browser.');
    const ua=navigator.userAgent||'';
    const isiOS=/iPhone|iPad|iPod/i.test(ua);
    if(isiOS&&!isStandalone()) throw new Error('On iPhone/iPad, install SignalForge to the Home Screen first, then open the installed app and enable alerts.');
    const permission=await Notification.requestPermission();
    if(permission!=='granted') throw new Error('Notification permission was not granted.');
    const config=await api('/api/push/config');
    if(!config.configured||!config.publicKey) throw new Error('SignalForge push keys are not configured yet.');
    const reg=await navigator.serviceWorker.ready;
    let sub=await reg.pushManager.getSubscription();
    if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey)});
    await syncSubscription(sub);
    showNote('Phone alerts enabled. You can send a test alert now.');
  }

  async function disableAlerts(){
    const sub=await currentSubscription();
    if(!sub)return;
    await api('/api/push/subscribe',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});
    await sub.unsubscribe();
    localStorage.removeItem(TEST_TOKEN_KEY);
    showNote('SignalForge phone alerts disabled.');
  }

  async function sendTest(){
    const sub=await currentSubscription();
    if(!sub) throw new Error('Enable alerts on this phone first.');
    await syncSubscription(sub);
    await api('/api/push/test',{method:'POST',body:JSON.stringify({endpoint:sub.endpoint,testToken:testToken()})});
    showNote('Test alert sent. Your phone should receive it within a few seconds.');
  }

  async function init(){
    const btn=ensureUi(),test=$('pushTestBtn');if(!btn)return;
    try{await refreshButton();}catch(err){console.warn('[SignalForge Push] config unavailable',err);btn.hidden=true;if(test)test.hidden=true;return;}
    btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try{if(btn.dataset.enabled==='1')await disableAlerts();else await enableAlerts();}
      catch(err){showNote(err.message||'Unable to change push alerts.',true);}
      finally{try{await refreshButton();}catch{btn.disabled=false;}}
    });
    test?.addEventListener('click',async()=>{
      test.disabled=true;
      try{await sendTest();}
      catch(err){
        if(err.status===429) showNote('Test cooldown is active. Try again in about one minute.',true);
        else showNote(err.message||'Unable to send test notification.',true);
      }finally{setTimeout(()=>{test.disabled=false;},1200);}
    });
  }

  window.addEventListener('load',()=>setTimeout(init,250));
})();
