(async()=>{
  const status=document.getElementById('tabletStatus'),connect=document.getElementById('tabletConnect');
  const nativeFetch=window.fetch.bind(window);
  let current=null,token=null,expires=0,busy=false,liveConnection=null;
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
    try{WeatherTabletData.seedPreferences(localStorage,current.mobile.device_defaults||current.mobile.settings,current.mobile.shared_settings||current.mobile.settings)}catch(error){console.warn('Tablet-Einstellungen konnten nicht vollständig gespeichert werden.')}
    message(current.mobile.measurements.toLocaleString('de-CH')+' Messungen offline gespeichert · Datenversion '+current.mobile.data_version);
  }else message('Noch keine Daten auf diesem Gerät. Mit Google verbinden und den veröffentlichten Stand herunterladen.');
  try{liveConnection=await WeatherOffline.readConnection()}catch(error){}
  const references=current?.mobile.references;
  window.WeatherFog={settings:references?.fog?.settings||{},days:new Map((references?.fog?.daily||[]).map(row=>[row.day,row])),loaded:!!references,error:references?'':'Noch keine Hochnebeldaten übertragen. Bitte am Mac neu veröffentlichen.'};
  const response=(data,status=200)=>Promise.resolve(new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}}));
  window.fetch=(input,options)=>{
    const path=String(input);
    if(!path.startsWith('/api/'))return nativeFetch(input,options);
    if(options?.method&&options.method!=='GET')return response({message:'Änderungen an gemeinsamen Daten erfolgen am Mac.'},405);
    const url=new URL(path,location.origin),snapshot=current?.mobile.daily;
    if(url.pathname==='/api/live')return WeatherTabletLive.read(nativeFetch,liveConnection,options?.signal).then(data=>response(data)).catch(error=>response({message:error.message},503));
    if(!current)return response({message:'Bitte zuerst in der Datenverwaltung Messdaten herunterladen.'},503);
    if(url.pathname==='/api/timeline')return response(snapshot);
    if(url.pathname==='/api/normals'){
      const periods=references?.normals||[],id=url.searchParams.get('id');
      return id?response(periods.find(p=>p.id===id)||{message:'Normperiode nicht vorhanden'},periods.some(p=>p.id===id)?200:404):response({periods});
    }
    if(url.pathname==='/api/data'){
      const years=[...new Set((snapshot.metrics.temperature||[]).map(row=>Number(row.day.slice(0,4))))].sort((a,b)=>a-b),requested=Number(url.searchParams.get('year'));
      return response({years,year:years.includes(requested)?requested:years.at(-1),report:{version:current.mobile.data_version,valid_rows:current.mobile.measurements}});
    }
    if(url.pathname==='/api/series'){try{return response(WeatherTabletData.series(snapshot,url.searchParams))}catch(error){return response({message:error.message},400)}}
    return response({message:'Diese Funktion ist auf dem Tablet noch nicht verfügbar.'},404);
  };
  window.addEventListener('weather-timeline-error',event=>message('Die Diagramme konnten nicht geladen werden: '+event.detail));
  document.getElementById('tabletReloadCharts').onclick=()=>location.reload();
  if(!current&&!location.hash)history.replaceState(null,'','#data');
  const scripts=['shell.js','view.js','thunder.js','axis-scales.js','weather-days.js','normal-curves.js','timeline.js','annual-data.js','annual.js','comparison-data.js','comparison.js','live-weather.js'];
  for(const path of scripts)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=path;script.onload=resolve;script.onerror=()=>reject(Error('App-Datei fehlt: '+path));document.body.append(script)});
  const liveForm=document.getElementById('tabletLiveForm'),liveMessage=document.getElementById('tabletLiveMessage');
  document.getElementById('tabletLiveUrl').value=window.WEATHER_LIVE_URL||'';
  if(liveConnection){document.getElementById('tabletLiveUrl').value=liveConnection.url;document.getElementById('tabletLiveRemember').checked=true;liveMessage.textContent='Live-Verbindung auf diesem Gerät gespeichert. Für eine Änderung den Zugangsschlüssel erneut eingeben.'}
  liveForm.onsubmit=async event=>{event.preventDefault();const button=liveForm.querySelector('[type=submit]');button.disabled=true;liveMessage.textContent='Live-Verbindung wird geprüft …';try{const connection={url:WeatherTabletLive.validateEndpoint(document.getElementById('tabletLiveUrl').value.trim()),token:document.getElementById('tabletLiveToken').value.trim()};await WeatherTabletLive.read(nativeFetch,connection);await WeatherOffline.saveConnection(document.getElementById('tabletLiveRemember').checked?connection:null);liveConnection=connection;document.getElementById('tabletLiveToken').value='';liveMessage.textContent='Verbunden. Aktuelle Messwerte können jetzt angezeigt werden.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(error){liveMessage.textContent=error.message}finally{button.disabled=false}};
  document.getElementById('tabletLiveForget').onclick=async()=>{try{await WeatherOffline.saveConnection(null);liveConnection=null;document.getElementById('tabletLiveUrl').value='';document.getElementById('tabletLiveToken').value='';liveMessage.textContent='Live-Verbindung entfernt. Historische Daten bleiben erhalten.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(error){liveMessage.textContent=error.message}};
  const rangeControl=document.getElementById('tabletRangeZoom');if(rangeControl)rangeControl.onchange=()=>document.body.classList.toggle('touch-range-zoom',rangeControl.checked);
  const resetControl=document.getElementById('tabletResetZoom');if(resetControl)resetControl.onclick=()=>window.dispatchEvent(new Event('weather-reset-zoom'));
  const normals=document.getElementById('tabletNormals');
  for(const period of references?.normals||[]){const card=document.createElement('section');card.className='norm-card norm-card-content';const title=document.createElement('h4');title.textContent=period.name;const details=document.createElement('p');details.textContent=period.station+' · '+period.start_year+'–'+period.end_year+' · '+period.day_count+' Tageswerte';card.append(title,details);normals.append(card)}
  if(!normals.children.length)normals.textContent='Keine Normperioden übertragen. Bitte den aktuellen Stand am Mac veröffentlichen und erneut herunterladen.';
  const fog=references?.fog?.settings;
  document.getElementById('tabletFogSettings').textContent=fog?'Station '+fog.station.toUpperCase()+' · eigene Solarstrahlung ≤ '+fog.solar_max+' W/m² · Differenz ≥ '+fog.difference_min+' W/m² · Feuchte ≥ '+fog.humidity_min+' % · '+fog.time_from+'–'+fog.time_to+' (Europe/Zurich)':'Noch keine Hochnebelparameter übertragen.';
  if('serviceWorker' in navigator){let updating=!!navigator.serviceWorker.controller;navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updating)location.reload();updating=true})}
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
