(async()=>{
  const status=document.getElementById('tabletStatus'),connect=document.getElementById('tabletConnect');
  const nativeFetch=window.fetch.bind(window);
  let current=null,token=null,expires=0,busy=false;
  const message=text=>status.textContent=text;
  const authorizedFetch=async url=>{
    if(!token||Date.now()>=expires)throw Error('Bitte erneut mit Google anmelden.');
    const response=await nativeFetch(url,{headers:{Authorization:'Bearer '+token},cache:'no-store'});
    if(response.status===401)throw Error('Google-Anmeldung abgelaufen. Bitte erneut verbinden.');
    if(!response.ok)throw Error('Google-Download fehlgeschlagen (HTTP '+response.status+').');return response;
  };
  async function download(){
    if(busy)return;busy=true;connect.disabled=true;
    try{
      message('Veröffentlichte Datenstände werden gesucht …');
      const query=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='wetterRole' and value='publication' }",orderBy:'createdTime desc',pageSize:'1',fields:'files(id,name)'});
      const result=await (await authorizedFetch('https://www.googleapis.com/drive/v3/files?'+query)).json();
      if(!result.files?.length)throw Error('Noch keine veröffentlichte Messdatenversion gefunden. Bitte zuerst am Mac hochladen.');
      const publication=await (await authorizedFetch('https://www.googleapis.com/drive/v3/files/'+encodeURIComponent(result.files[0].id)+'?alt=media')).json();
      if(!publication.mobile)throw Error('Dieser Google-Datenstand ist noch nicht tablet-kompatibel. Bitte am Mac erneut hochladen.');
      if(current?.publication.bundle_id===publication.bundle_id){message('Der gespeicherte Datenstand ist aktuell.');return}
      await WeatherReceiver.receive(authorizedFetch,publication,WeatherOffline,message);
      if(navigator.storage?.persist)await navigator.storage.persist().catch(()=>false);
      location.reload();
    }catch(error){message(error.message+' Bereits gespeicherte Daten bleiben verfügbar.')}finally{busy=false;connect.disabled=false}
  }
  try{current=await WeatherOffline.read()}catch(error){message(error.message)}
  if(current){
    for(const key of WeatherReceiver.SETTINGS){localStorage.removeItem('wetter.'+key);if(current.mobile.settings[key]!==undefined)localStorage.setItem('wetter.'+key,JSON.stringify(current.mobile.settings[key]))}
    document.body.classList.toggle('light',current.mobile.settings.preferences?.theme==='light');
    message(current.mobile.measurements.toLocaleString('de-CH')+' Messungen offline gespeichert · Datenversion '+current.mobile.data_version);
  }else message('Noch keine Daten auf diesem Gerät. Mit Google verbinden und den veröffentlichten Stand herunterladen.');
  // Timeline consumes the same daily format as the desktop; there is no Mac dependency.
  window.fetch=(input,options)=>{
    if(String(input)==='/api/timeline')return Promise.resolve(new Response(JSON.stringify(current?.mobile.daily||{message:'Bitte zuerst Messdaten herunterladen.'}),{status:current?200:503,headers:{'Content-Type':'application/json'}}));
    return nativeFetch(input,options);
  };
  const scripts=['view.js','thunder.js','axis-scales.js','weather-days.js','timeline.js'];
  if(!location.hash)history.replaceState(null,'','#timeline');
  for(const path of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=path;script.onload=resolve;script.onerror=()=>reject(Error('App-Datei fehlt: '+path));document.body.append(script)});
  if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(()=>message(status.textContent+' · Offline-App konnte noch nicht eingerichtet werden.'));
  document.getElementById('tabletInstall').onclick=()=>message('Im Chrome-Menü „App installieren“ oder „Zum Startbildschirm hinzufügen“ wählen. Vor dem Flugmodus die Installation und den Datendownload abschliessen.');
  if(!window.WEATHER_WEB_CLIENT_ID){connect.disabled=true;document.getElementById('tabletSetup').hidden=false;return}
  function googleReady(){
    connect.disabled=false;
    const client=google.accounts.oauth2.initTokenClient({client_id:window.WEATHER_WEB_CLIENT_ID,scope:'https://www.googleapis.com/auth/drive.appdata',callback:result=>{
      if(result.error){message('Google-Anmeldung wurde nicht abgeschlossen.');return}
      if(!google.accounts.oauth2.hasGrantedAllScopes(result,'https://www.googleapis.com/auth/drive.appdata')){message('App-Daten-Zugriff wurde nicht freigegeben.');return}
      token=result.access_token;expires=Date.now()+Number(result.expires_in)*1000;download();
    },error_callback:()=>message('Google-Anmeldefenster wurde geschlossen oder blockiert.')});
    connect.onclick=()=>client.requestAccessToken();
  }
  const googleScript=document.createElement('script');googleScript.src='https://accounts.google.com/gsi/client';googleScript.async=true;googleScript.onload=googleReady;googleScript.onerror=()=>message(status.textContent+' · Für einen neuen Download bitte eine Internetverbindung herstellen und die App erneut öffnen.');document.head.append(googleScript);
})().catch(error=>{document.getElementById('tabletStatus').textContent='Die Tablet-App konnte nicht vollständig geöffnet werden: '+error.message+' Gespeicherte Offline-Daten wurden nicht gelöscht.'});
