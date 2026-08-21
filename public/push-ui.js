(() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const isStandalone=()=>window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;
  const supported=()=>('serviceWorker'in navigator)&&('PushManager'in window)&&('Notification'in window);

  function ensureUi(){
    if($('pushAlertsBtn')) return $('pushAlertsBtn');
    const actions=document.querySelector('.top-actions');
    if(!actions) return null;
    const btn=document.createElement('button');
    btn.id='pushAlertsBtn';btn.type='button';btn.className='btn ghost push-alert-btn';btn.textContent='Enable Alerts';
    actions.appendChild(btn);
    const note=document.createElement('div');note.id='pushAlertNote';note.className='push-alert-note';note.hidden=true;actions.appendChild(note);
    return btn;
  }

  async function api(path,options={}){
    const res=await fetch(path,{...options,headers:{'content-type':'application/json',accept:'application/json',...(options.headers||{})}});
    const body=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(body.error||`HTTP ${res.status}`);
    return body;
  }

  function decodeKey(value){
    const padding='='.repeat((4-value.length%4)%4);
    const base64=(value+padding).replace(/-/g,'+').replace(/_/g,'/');
    const raw=atob(base64);return Uint8Array.from([...raw].map(ch=>ch.charCodeAt(0)));
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

  async function refreshButton(config=null){
    const btn=ensureUi();if(!btn)return;
    if(!supported()){btn.hidden=true;return;}
    const cfg=config||await api('/api/push/config');
    if(!cfg.configured){btn.textContent='Alerts Setup Needed';btn.disabled=true;return;}
    const sub=await currentSubscription();
    btn.disabled=false;btn.textContent=sub?'Disable Alerts':'Enable Alerts';btn.dataset.enabled=sub?'1':'0';
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
    await api('/api/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});
    showNote('Phone alerts enabled for SignalForge status changes.');
  }

  async function disableAlerts(){
    const sub=await currentSubscription();
    if(!sub)return;
    await api('/api/push/subscribe',{method:'DELETE',body:JSON.stringify({endpoint:sub.endpoint})});
    await sub.unsubscribe();
    showNote('SignalForge phone alerts disabled.');
  }

  async function init(){
    const btn=ensureUi();if(!btn)return;
    try{await refreshButton();}catch(err){console.warn('[SignalForge Push] config unavailable',err);btn.hidden=true;return;}
    btn.addEventListener('click',async()=>{
      btn.disabled=true;
      try{if(btn.dataset.enabled==='1')await disableAlerts();else await enableAlerts();}
      catch(err){showNote(err.message||'Unable to change push alerts.',true);}
      finally{try{await refreshButton();}catch{btn.disabled=false;}}
    });
  }

  window.addEventListener('load',()=>setTimeout(init,250));
})();
