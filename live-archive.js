/* NAS-only archive. No connection to the imported measurement database or Google bundles. */
(()=>{
 const $=id=>document.getElementById(id);if(!$('nasForm'))return;
 const tablet=typeof window.WEATHER_WEB_CLIENT_ID!=='undefined';let connection=null;

 function validate(url,token){const u=new URL(url);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||!['','/'].includes(u.pathname)||token.length<32||token.length>256)throw Error('NAS-Adresse und eigenen Lesezugang prüfen.');if(tablet&&u.protocol!=='https:')throw Error('Die Tablet-Web-App benötigt für das NAS eine HTTPS-Adresse mit gültigem Zertifikat.');return {url:u.origin,token}}
 const schedule=WeatherLiveCardData.createRequestQueue(2);let catalogCached=null;
 window.addEventListener('weather-live-connection-changed',()=>{catalogCached=null});
 async function request(path,query,options={}){
  if(path==='/catalog'&&catalogCached&&Date.now()-catalogCached.at<60000)return catalogCached.data;
  const run=async()=>{
   if(options.signal?.aborted)throw new DOMException('Abgebrochen','AbortError');
   const controller=new AbortController(),cancel=()=>controller.abort(),timeout=setTimeout(cancel,25000);
   options.signal?.addEventListener('abort',cancel,{once:true});
   try{
    const url=tablet?connection?.url+path:'/api/nas'+path;
    if(tablet&&!connection)throw Error('NAS noch nicht verbunden.');
    const response=await fetch(url+(query?'?'+new URLSearchParams(query):''),{headers:tablet?{Authorization:'Bearer '+connection.token}:{},signal:controller.signal,credentials:'omit',redirect:'error',cache:'no-store'});
    const text=await response.text();if(text.length>2097152)throw Error('Archivantwort zu gross.');
    const result=JSON.parse(text);if(!response.ok)throw Error(result.message||'NAS-Live-Archiv nicht erreichbar.');
    if(path==='/catalog')catalogCached={at:Date.now(),data:result};return result;
   }finally{clearTimeout(timeout);options.signal?.removeEventListener('abort',cancel)}
  };
  return (['/catalog','/series'].includes(path)||path==='/meteoswiss'&&['catalog','series'].includes(query?.action))?schedule(run,options.signal):run();
 }
 window.WeatherNasArchive={request,connected:()=>!!connection};
 $('nasForm').onsubmit=async e=>{e.preventDefault();const button=$('nasForm').querySelector('button');button.disabled=true;$('nasStatus').textContent='NAS-Verbindung wird geprüft …';const previous=connection;try{const next=validate($('nasUrl').value.trim(),$('nasToken').value.trim());if(tablet){connection=next;await request('/catalog');if($('nasRemember').checked)localStorage.setItem('wetter.nasConnection',JSON.stringify(next));else localStorage.removeItem('wetter.nasConnection')}else{const r=await fetch('/api/nas/config',{method:'POST',headers:{'Content-Type':'application/json','X-Wetter-Token':$('nasForm').dataset.token},body:JSON.stringify(next)});const result=await r.json();if(!r.ok)throw Error(result.message);connection={url:result.url}}$('nasToken').value='';$('nasStatus').textContent='NAS verbunden. Aktuelle Messwerte und Live-Verlauf verwenden das separate NAS-Archiv.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(error){connection=previous;$('nasStatus').textContent=error.message}finally{button.disabled=false}};
 $('nasDisconnect').onclick=async()=>{try{if(tablet)localStorage.removeItem('wetter.nasConnection');else{const r=await fetch('/api/nas/config',{method:'POST',headers:{'Content-Type':'application/json','X-Wetter-Token':$('nasForm').dataset.token},body:JSON.stringify({disconnect:true})});if(!r.ok)throw Error('Verbindung konnte nicht getrennt werden.')}connection=null;$('nasStatus').textContent='App-Verbindung getrennt. Die Aufzeichnung auf dem NAS läuft weiter.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(e){$('nasStatus').textContent=e.message}};

 (async()=>{try{if(tablet){const saved=JSON.parse(localStorage.getItem('wetter.nasConnection')||'null');if(saved)connection=validate(saved.url,saved.token);$('nasRemember').checked=!!connection}else{const state=await request('/config');if(state.configured)connection={url:state.url};$('nasRemember').closest('label').hidden=true}if(connection){$('nasUrl').value=connection.url;$('nasStatus').textContent='NAS-Verbindung eingerichtet. Zum Ändern Lesezugang erneut eingeben.';window.dispatchEvent(new Event('weather-live-connection-changed'))}else $('nasStatus').textContent='Noch nicht eingerichtet. Sammler auf dem NAS starten und hier verbinden.'}catch(e){$('nasStatus').textContent='NAS-Verbindung noch nicht eingerichtet.'}})();
})();

/* Three synchronized chart areas over the independent NAS live archive. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id),Layout=window.WeatherLiveLayout;
 const dialog=$('liveArchiveDialog'),svg=$('archivePlot'),tip=$('archiveTooltip');
 if(!dialog||!Layout)return;
 const canvas=svg.parentElement,station=$('archiveStation'),range=$('archiveRange'),mode=$('archiveMode');
 const status=$('archiveStatus'),metrics=$('archiveMetrics'),view=$('archiveView');
 let noticeTimer;
 new MutationObserver(()=>{
  clearTimeout(noticeTimer);
  const text=status.textContent.trim();
  const notice=!!text&&!/^(Schweizer Ortszeit|Monatswerte|Tageswerte)(?:$| ·)/.test(text);
  status.classList.toggle('is-notice',notice);
  if(notice)noticeTimer=setTimeout(()=>status.classList.remove('is-notice'),7000);
 }).observe(status,{childList:true,characterData:true,subtree:true});
 const DAY=86400,DRAFT='wetter.liveArchiveDraft',VIEWS='wetter.liveViews';
 const kinds={temperature_c:'thermohygro',humidity_percent:'thermohygro',rain_total_mm:'rain',wind_kmh:'wind',gust_kmh:'wind',wind_direction_degrees:'wind',pressure_hpa:'pressure',solar_wm2:'solar',uv_index:'solar'};
 const rangeOptions=[['1','1 Stunde'],['2','2 Stunden'],['6','6 Stunden'],['24','24 Stunden'],['168','7 Tage'],['720','Monat'],['8760','Jahr'],['custom','Freier Zeitraum']];
 const clone=value=>JSON.parse(JSON.stringify(value));
 const read=(key,fallback)=>{try{return JSON.parse(localStorage.getItem(key))??fallback}catch(error){return fallback}};
 let config=Layout.defaults(),activeView='',configured=false,opened=false,pan=false,drag=null,plot=null;
 let source=null,available=[],shown=[],stormData=null,shownWindow=null,controller=null,revision=0,loaded=new Map(),refreshTimer,warmTimer,warmController=null,warmTargets=[],warming=false;
 let smoothing=0;try{smoothing=Math.max(0,Math.min(5,parseInt(localStorage.getItem('wetter.liveSmoothing'))||0))}catch(error){}
 const smoothingLabels=['Aus','Sehr schwach','Schwach','Mittel','Stark','Sehr stark'];
 function smoothingButton(){$('archiveSmoothing').textContent='∿ '+smoothingLabels[smoothing];$('archiveSmoothing').setAttribute('aria-pressed',String(smoothing>0))}
 smoothingButton();
 $('archiveSmoothing').onclick=()=>{smoothing=(smoothing+1)%6;try{localStorage.setItem('wetter.liveSmoothing',String(smoothing))}catch(error){}smoothingButton();draw()};
 const touchPoints=new Map();let pinch=null,suppressTouch=false,wheelTimer;
 let lastRange='24',lastMode='rolling',frame=0;
 const expandedScales=new Set();
 let timeAxisCache=null;
 const savedDraft=read(DRAFT,null);
 if(Layout.valid(savedDraft?.config)){config=savedDraft.config;activeView=savedDraft.view||'';opened=true}
 const legacyColors=read('wetter.liveDetailColors',{});
 for(const spec of Layout.definitions)if(/^#[a-f\d]{6}$/i.test(legacyColors[spec.key])&&!config.colors[spec.key])config.colors[spec.key]=legacyColors[spec.key];
 const color=spec=>config.colors[spec.key]||spec.color;
 const localParts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 const localInput=stamp=>localParts.format(new Date(stamp*1000)).replace(' ','T');
 const format=(value,digits=1)=>value.toLocaleString('de-CH',{maximumFractionDigits:digits});
 const stampLabel=stamp=>new Date(stamp*1000).toLocaleString('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 const dateLabel=(stamp,options)=>new Date(stamp*1000).toLocaleString('de-CH',{timeZone:'Europe/Zurich',...options});
 function parseSwiss(value){
  if(!value)return NaN;
  const wall=Date.parse(value+'Z')/1000;
  let stamp=wall;
  for(let i=0;i<3;i++)stamp+=wall-Date.parse(localInput(stamp)+'Z')/1000;
  return localInput(stamp)===value?stamp:NaN;
 }
 function storeDraft(){
  try{localStorage.setItem(DRAFT,JSON.stringify({config,view:activeView}))}
  catch(error){status.textContent='Ansicht nur für diese Sitzung übernommen. Gerätespeicher ist voll oder gesperrt.'}
 }
 function views(){
  const items=read(VIEWS,{});
  return Layout.validViews(items)?items:{};
 }
 function fillViews(){
  const entries=Object.entries(views()).sort((a,b)=>a[1].name.localeCompare(b[1].name,'de-CH'));
  view.replaceChildren(new Option('Eigene Ansicht',''),...entries.map(([id,item])=>new Option(item.name,id)));
  if(!entries.some(([id])=>id===activeView))activeView='';
  view.value=activeView;
  $('archiveDeleteView').disabled=!activeView;
 }
 function dirty(){
  view.value=views()[activeView]?activeView:'';
  storeDraft();drawLegend();
 }
 function fillStation(){
  station.replaceChildren(...Array.from($('liveStation').children,n=>n.cloneNode(true)));
  if(!Array.from(station.options).some(option=>option.value===config.station))station.add(new Option(config.station.toUpperCase(),config.station));
  station.value=config.station;
 }
 rangeOptions.forEach(([value,label])=>range.add(new Option(label,value)));
 function setConfiguration(value){
  configured=value;$('archiveConfiguration').hidden=!value;
  $('archiveConfigure').setAttribute('aria-pressed',String(value));
  $('archiveConfigure').textContent=value?'✓ Fertig':'⚙ Anpassen';
  dialog.classList.toggle('is-configuring',value);
  scheduleDraw();
 }
 function updateRange(){
  const custom=config.range==='custom',long=['720','8760'].includes(config.range);
  $('archiveModeLabel').hidden=!long;
  dialog.querySelectorAll('[data-archive-custom]').forEach(label=>{label.hidden=!custom});
  if(long){
   mode.options[0].text=config.range==='720'?'Letzte 30 Tage':'Letzte 12 Monate';
   mode.options[1].text=config.range==='720'?'Kalendermonat':'Kalenderjahr';
  }
  if(custom&&!config.start){
   const now=Date.now()/1000;config.start=localInput(now-DAY);config.end=localInput(now);
   $('archiveStart').value=config.start;$('archiveEnd').value=config.end;
  }
 }
 function reflect(){
  fillStation();range.value=config.range;mode.value=config.mode;
  $('archiveStart').value=config.start;$('archiveEnd').value=config.end;
  $('archiveResolution').value=config.resolution;$('archiveStorm').checked=config.storm;
  $('archiveBRatio').value=String(config.heights.b);
  updateRange();makeControls();drawLegend();
 }
 function request(path,query,signal,code=config.station){
  return code?WeatherNasArchive.request('/meteoswiss',{...query,station:code,action:path.slice(1)},{signal}):WeatherNasArchive.request(path,query,{signal});
 }
 function begin(){
  controller?.abort();warmController?.abort();clearTimeout(warmTimer);warmTimer=null;warmTargets=[];controller=new AbortController();
  return {id:++revision,signal:controller.signal};
 }
 async function getSource(signal,code){
  const current=window.WeatherCurrentLiveState?.();
  const live=current&&(current.station||'')===code?current:await request('/live',null,signal,code);
  const catalog=await request('/catalog',null,signal,code),sensors=new Map(live.sensors.map(sensor=>[sensor.key,sensor]));
  const series=Layout.definitions.flatMap(spec=>{
   const archive=catalog.series.find(item=>item.metric===spec.key&&sensors.get(item.sensor)?.kind===kinds[spec.key]);
   return archive?[{...spec,archive}]:[];
  });
  const thunder=catalog.series.find(item=>item.metric==='lightning_count'&&sensors.get(item.sensor)?.kind==='lightning');
  return {code,series,thunder,observedEnd:live.observed_end};
 }
 function controlsSpecs(){
  return Layout.definitions.filter(spec=>available.some(item=>item.key===spec.key)||config.assignments[spec.key]);
 }
 function makeControls(){
  const moreOpen=metrics.querySelector('details.archive-area-card')?.open||false;
  metrics.replaceChildren();
  const specs=controlsSpecs();
  for(const area of [...Layout.areas,'']){
   const card=document.createElement(area?'section':'details'),heading=document.createElement(area?'h4':'summary'),rows=document.createElement('div');
   if(!area)card.open=moreOpen;
   card.className='archive-area-card';card.dataset.area=area;
   heading.textContent=area?'Bereich '+area:'Weitere Messgrössen ('+specs.filter(item=>!config.assignments[item.key]).length+')';rows.className='archive-card-metrics';
   for(const spec of specs.filter(item=>(config.assignments[item.key]||'')===area)){
    const row=document.createElement('div'),title=document.createElement('span'),select=document.createElement('select'),picker=document.createElement('input');
    row.className='archive-assignment';title.textContent=spec.label;
    if(!available.some(item=>item.key===spec.key))title.textContent+=' · keine Daten';
    for(const [value,label] of [['','Aus'],['A','A'],['B','B'],['C','C']])select.add(new Option(label,value));
    select.value=area;select.setAttribute('aria-label','Bereich für '+spec.label);
    select.onchange=()=>{
     if(select.value)config.assignments[spec.key]=select.value;else delete config.assignments[spec.key];
     dirty();makeControls();load();
    };
    picker.type='color';picker.value=color(spec);picker.setAttribute('aria-label','Farbe '+spec.label);
    picker.oninput=()=>{config.colors[spec.key]=picker.value;dirty();draw()};
    row.append(picker,select,title);rows.append(row);
   }
   const axisControls=document.createElement('div');axisControls.className='archive-card-scales';
   card.append(heading,rows,axisControls);
   if(area)metrics.append(card);else if(rows.children.length)metrics.prepend(card);
  }
  makeScaleControls();
 }
 function makeScaleControls(){
  for(const area of Layout.areas){
   const container=metrics.querySelector('[data-area="'+area+'"] .archive-card-scales');
   if(!container)continue;
   container.replaceChildren();
   const specs=Layout.definitions.filter(spec=>config.assignments[spec.key]===area);
   for(const axisId of new Set(specs.map(spec=>spec.axis))){
    const matching=specs.filter(spec=>spec.axis===axisId),live=visibleSeries().filter(spec=>config.assignments[spec.key]===area&&spec.axis===axisId);
    const automatic=Layout.axesFor(live).find(axis=>axis.key===axisId);
    const fallback=axisId==='pressure'?[900,1100]:axisId==='temperature'?[-20,40]:axisId==='direction'?[0,360]:[0,100];
    const saved=config.bounds[area]?.[axisId],bounds=saved||(automatic?[automatic.min,automatic.max]:fallback);
    const row=document.createElement('details'),label=document.createElement('summary'),controls=document.createElement('div'),autoLabel=document.createElement('label');
    const auto=document.createElement('input'),min=document.createElement('input'),max=document.createElement('input');
    row.className='archive-axis-setting';controls.className='archive-axis-controls';
    const scaleKey=area+'/'+axisId;
    row.open=expandedScales.has(scaleKey);
    row.ontoggle=()=>{if(row.open)expandedScales.add(scaleKey);else expandedScales.delete(scaleKey)};
    const name=matching.map(spec=>spec.label).join(' / ');
    label.textContent='Skala · '+name+' ('+(matching[0].unit||'Index')+')';
    auto.type='checkbox';auto.checked=!saved;autoLabel.append(auto,'Auto');
    controls.append(autoLabel);
    for(const [input,value,title] of [[min,bounds[0],'Min'],[max,bounds[1],'Max']]){
     const field=document.createElement('label');
     input.type='number';input.step='any';input.value=String(Math.round(value*10)/10);input.disabled=auto.checked;
     input.setAttribute('aria-label',title+' '+area+' · '+name);input.title=title;
     field.append(document.createTextNode(title),input);controls.append(field);
    }
    const save=()=>{
     if(!auto.checked&&(!min.value||!max.value||!Number.isFinite(+min.value)||!Number.isFinite(+max.value)||+min.value>=+max.value||Math.max(Math.abs(+min.value),Math.abs(+max.value))>1e9)){
      status.textContent='Für die Skala muss Min kleiner als Max sein.';return;
     }
     if(!config.bounds[area])config.bounds[area]={};
     if(auto.checked)delete config.bounds[area][axisId];else config.bounds[area][axisId]=[+min.value,+max.value];
     min.disabled=max.disabled=auto.checked;dirty();draw();
    };
    auto.onchange=save;min.oninput=max.oninput=min.onchange=max.onchange=save;
    row.append(label,controls);container.append(row);
   }
  }
 }
 function drawLegend(){
  const legend=$('archiveLegend');legend.replaceChildren();
  for(const spec of Layout.definitions.filter(item=>config.assignments[item.key])){
   const item=document.createElement('button');item.type='button';item.style.color=color(spec);
   item.textContent=spec.label;item.title=spec.label+' ausblenden';
   item.onclick=()=>{delete config.assignments[spec.key];dirty();makeControls();load()};
   legend.append(item);
  }
  if(config.storm){const label=document.createElement('span');label.textContent='⚡ Gewitter';legend.append(label)}
 }
 function drawStatistics(visible){
  const host=$('archiveStatistics');host.replaceChildren();
  const append=(label,value,ink)=>{const item=document.createElement('span');item.style.color=ink;const name=document.createElement('span');name.textContent=label+' ';const data=document.createElement('b');data.textContent=value;item.append(name,data);host.append(item)};
  for(const spec of visible){
   const stats=Layout.statistics(spec);if(!stats)continue;
   const unit=spec.unit?' '+spec.unit:'';
   const value='sum' in stats?'Σ '+(stats.partial?'≥ ':'')+format(stats.sum)+unit:'change' in stats?'Δ '+(stats.change>0?'+':'')+format(stats.change)+unit:'Min '+format(stats.min)+' / Max '+format(stats.max)+unit;
   append(spec.label,value,color(spec));
  }
  if(config.storm&&stormData){
   const points=(stormData.points||[]).filter(p=>p.time>=shownWindow.start&&p.time<=shownWindow.end&&p.value>0);
   const count=points.reduce((s,p)=>s+p.value,0),distances=points.map(p=>p.nearest).filter(Number.isFinite);
   append('⚡ Gewitter',format(count,0)+' Blitze'+(distances.length?' · nächster '+format(Math.min(...distances))+' km':''),'var(--text)');
  }
 }
 function plotWindow(){
  const now=Date.now()/1000,observed=Math.min(now,source?.observedEnd??now);
  if(config.range!=='custom'){
   const window=WeatherLiveCardData.rangeWindow(observed,config.range,config.mode);
   return {...window,period:config.range==='720'?'day':config.range==='8760'?'month':null};
  }
  const start=parseSwiss(config.start),end=parseSwiss(config.end),span=end-start;
  if(!Number.isFinite(start)||!Number.isFinite(end)||span<=0)throw Error('Bitte einen gültigen Zeitraum in Schweizer Ortszeit wählen.');
  if(span>366*DAY)throw Error('Pro Ansicht sind höchstens 366 Tage möglich.');
  if(source?.code&&start<now-370*DAY)throw Error('Für MeteoSchweiz sind die letzten 370 Tage verfügbar.');
  const period=config.resolution==='auto'?(span>90*DAY?'month':span>7*DAY?'day':null):config.resolution==='raw'?null:config.resolution;
  if(source?.code&&!period&&span>10*DAY)throw Error('Für mehr als zehn Tage bei MeteoSchweiz bitte täglich oder monatlich wählen.');
  return {start,end,observedEnd:Math.min(end,observed),period};
 }
 function cacheIdentity(spec,window,code){
  const bucket=spec.key==='lightning_count'||spec.key==='rain_total_mm'?Math.max(60,Math.ceil((window.end-window.start)/140/60)*60):0;
  return JSON.stringify([code,spec.archive.provider,spec.archive.sensor,spec.key,spec.archive.unit,window.period,bucket]);
 }
 function stormSpec(){return {key:'lightning_count',archive:source.thunder}}
 function stormWindow(window){return {...window,period:window.end-window.start>7*DAY?'day':null}}
 function visibleSeries(){
  if(!shownWindow)return [];
  return shown.map(spec=>({...spec,data:{...spec.data,points:spec.data.points.filter(point=>
   shownWindow.period?point.last>=shownWindow.start&&point.first<=shownWindow.end:point.time>=shownWindow.start&&point.time<=shownWindow.end
  )}})).filter(spec=>spec.data.points.length);
 }
 async function seriesData(spec,window,signal,code,pending){
  const {start,observedEnd,period}=window;
  if(observedEnd<=start)return {points:[]};
  const cache=loaded,identity=cacheIdentity(spec,window,code);
  const cached=Layout.cachedSeries(cache.get(identity)||[],start,observedEnd,period);
  if(cached.covered)return cached.data;
  const buffered=Layout.bufferWindow(window,code,source?.observedEnd??Date.now()/1000);
  const archive=spec.archive,storm=spec.key==='lightning_count';
  const aggregation=storm?'lightning_events':spec.key==='rain_total_mm'?'rain_increment':period?'calendar':null;
  const query={provider:archive.provider,sensor:archive.sensor,metric:archive.metric,unit:archive.unit,start:buffered.start,end:buffered.observedEnd};
  if(query.end<=query.start)return {points:[]};
  if(aggregation)query.aggregation=aggregation;
  if(period)query.period=period;
  if(storm||spec.key==='rain_total_mm')query.bucket_seconds=Math.max(60,Math.ceil((window.end-window.start)/140/60)*60);
  const key=JSON.stringify([code,query]);
  if(!pending.has(key)){
   pending.set(key,request('/series',query,signal,code).then(data=>{
    const normalized={...data,points:data.points.map(point=>({...point,
     value:spec.key==='gust_kmh'?(point.maximum??point.value):point.value,
     time:point.time??(point.first+point.last)/2,
    })).filter(point=>Number.isFinite(point.value))};
    const entries=cache.get(identity)||[];
    entries.push({start:query.start,end:query.end,data:normalized});
    cache.delete(identity);cache.set(identity,entries.slice(-6));
    if(cache.size>36)cache.delete(cache.keys().next().value);
   }));
  }
  await pending.get(key);
  return Layout.cachedSeries(cache.get(identity)||[],start,observedEnd,period).data;
 }
 function queueWarm(windows){
  warmTargets=windows;
  if(warming||warmTimer)return;
  warmTimer=setTimeout(async()=>{
   warmTimer=null;
   if(!source||!dialog.open)return;
   warming=true;warmController=new AbortController();
   const signal=warmController.signal,epoch=revision,code=config.station;
   try{
    while(warmTargets.length&&!signal.aborted){
     const target=warmTargets.shift(),now=Date.now()/1000;
     const window={...target,start:Math.max(code?now-370*DAY:0,target.start),observedEnd:Math.min(target.end,source.observedEnd??now,now)};
     if(window.observedEnd<=window.start)continue;
     const pending=new Map(),specs=available.filter(spec=>config.assignments[spec.key]);
     const jobs=specs.map(spec=>seriesData(spec,window,signal,code,pending));
     if(config.storm&&source.thunder)jobs.push(seriesData(stormSpec(),stormWindow(window),signal,code,pending));
     await Promise.allSettled(jobs);
     if(signal.aborted||epoch!==revision)break;
     if(drag){
      shown=shown.map(spec=>({...spec,data:Layout.cachedSeries(loaded.get(cacheIdentity(spec,drag.window,code))||[],drag.window.start,drag.window.observedEnd,drag.window.period).data}));
      if(config.storm&&source.thunder)stormData=Layout.cachedSeries(loaded.get(cacheIdentity(stormSpec(),stormWindow(drag.window),code))||[],drag.window.start,drag.window.observedEnd,stormWindow(drag.window).period).data;
      draw();
     }
    }
   }finally{warming=false;if(warmTargets.length&&dialog.open)queueWarm(warmTargets)}
  },180);
 }
 async function load(force=false){
  if(!dialog.open)return;
  const {id,signal}=begin(),code=config.station;
  try{
   if(force||source?.code!==code){
    if(source?.code!==code)loaded=new Map();
    source=null;available=[];shown=[];stormData=null;draw();status.textContent='Wetterstation wird geladen …';
    const next=await getSource(signal,code);
    if(id!==revision)return;
    source=next;available=next.series;makeControls();
   }
   const requested=plotWindow(),key=JSON.stringify([code,config.range,config.mode,config.start,config.end,config.resolution]);
   if(force){loaded=new Map();shown=[];stormData=null}
   const window=shownWindow?.key===key&&!force?shownWindow:{...requested,key};
   if(shownWindow?.period!==window.period){shown=[];stormData=null}
   shownWindow=window;draw();
   const specs=available.filter(spec=>config.assignments[spec.key]);
   status.textContent='Verlauf wird geladen …';
   const pending=new Map(),jobs=specs.map(async spec=>({...spec,data:await seriesData(spec,window,signal,code,pending)}));
   if(config.storm&&source.thunder){
    jobs.push(seriesData(stormSpec(),stormWindow(window),signal,code,pending).then(data=>({storm:true,data})));
   }
   const results=await Promise.allSettled(jobs);
   if(id!==revision)return;
   shown=results.flatMap(result=>result.status==='fulfilled'&&!result.value.storm&&result.value.data.points.length?[result.value]:[]);
   stormData=results.find(result=>result.status==='fulfilled'&&result.value.storm)?.value.data??null;
   const missing=specs.filter(spec=>!shown.some(item=>item.key===spec.key)).map(spec=>spec.label);
   const failed=results.some(result=>result.status==='rejected');
   status.textContent=failed?'Einige Daten konnten nicht geladen werden. Mit ↻ erneut versuchen.':
    missing.length?'Keine Werte für '+missing.join(', ')+'.':
    !specs.length&&!stormData?'Unter «Anpassen» Messgrössen den Bereichen A, B oder C zuordnen.':
    (window.period==='month'?'Monatswerte':window.period==='day'?'Tageswerte':'Schweizer Ortszeit')+
    (code&&window.period&&shown.some(spec=>spec.key==='rain_total_mm')?' · Regen-Tagesgrenze 06:00 UTC':'');
   draw();makeScaleControls();
   queueWarm([Layout.shifted(window,-.5),Layout.shifted(window,.5)].map(target=>({...window,...target})));
  }catch(error){
   if(id!==revision)return;
   draw();status.textContent=error.name==='AbortError'?'Das NAS antwortet nicht.':error.message;
  }
 }
 function scheduleDraw(){
  cancelAnimationFrame(frame);frame=requestAnimationFrame(draw);
 }
 function draw(){
  svg.replaceChildren();tip.hidden=true;plot=null;
  if(!shownWindow){$('archiveStatistics').replaceChildren();$('archiveUpperGrip').hidden=$('archiveLowerGrip').hidden=true;return}
  const {start,end,period}=shownWindow;
  const height=Math.max(140,canvas.clientHeight);
  const visible=visibleSeries();drawStatistics(visible);
  const areaAxes=pinch?.axes||drag?.axes||Object.fromEntries(Layout.areas.map(area=>[area,Layout.axesFor(visible.filter(spec=>config.assignments[spec.key]===area),config.bounds[area])]));
  const columns=Layout.axisColumns(Object.values(areaAxes));
  const width=Math.max(320,canvas.clientWidth,columns.left+columns.right.reduce((sum,value)=>sum+value,0)+230);
  svg.style.width=width+'px';
  const layout=Layout.geometry(width,height,config.heights,Layout.areas.map(area=>areaAxes[area].length),config.storm?(end-start<40*DAY?54:32):0,columns);
  const {left,right}=layout,x=time=>left+(time-start)/(end-start)*(right-left);
  svg.style.height=layout.height+'px';svg.setAttribute('viewBox',`0 0 ${width} ${layout.height}`);
  const add=(tag,attrs={},text,parent=svg)=>{
   const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
   for(const [key,value] of Object.entries(attrs))node.setAttribute(key,String(value));
   if(text!==undefined)node.textContent=text;
   parent.append(node);return node;
  };
  add('rect',{x:left,y:layout.top,width:right-left,height:layout.areas.B.bottom-layout.top,class:'plot-background'});
  add('rect',{x:left,y:layout.areas.C.top,width:right-left,height:layout.areas.C.bottom-layout.areas.C.top,class:'plot-background'});
  const defs=add('defs'),grid=add('g',{'data-layer':'grid'}),allMarks=add('g',{'data-layer':'measurements'}),areaMarks={};
  const timeLayers=drawTimeAxis(add,layout,x,start,end,defs,grid);
  let stormLayer=null;
  for(const area of Layout.areas){
   const box=layout.areas[area],clip=add('clipPath',{id:'live-detail-clip-'+area},undefined,defs);
   add('rect',{x:left,y:box.top+1,width:right-left,height:box.bottom-box.top-2},undefined,clip);
   const clipped=add('g',{'clip-path':'url(#live-detail-clip-'+area+')'},undefined,allMarks);
   areaMarks[area]=add('g',{},undefined,clipped);
   const axes=areaAxes[area],ticks=area==='B'?2:4;
   axes.forEach((axis,index)=>{
    const values=axis.key==='direction'?Layout.directionTicks(axis.min,axis.max,box.bottom-box.top-34):
     Layout.numericTicks(axis.min,axis.max,ticks,['temperature','humidity','pressure','solar','wind'].includes(axis.key)).map(value=>({value,label:format(value,['temperature','humidity','pressure','solar','wind'].includes(axis.key)?0:1)}));
    const ink=axis.key==='direction'?'var(--text)':color(axis.series[0]),labelX=layout.axisX[index];
    for(const tick of values){
     const fraction=(tick.value-axis.min)/(axis.max-axis.min);
     const yy=axis.key==='direction'?box.top+26+fraction*(box.bottom-box.top-34):box.bottom-8-fraction*(box.bottom-box.top-34);
     if(index===0&&fraction>0&&fraction<1)add('line',{x1:left,x2:right,y1:yy,y2:yy,class:'live-detail-grid'},undefined,grid);
     add('text',{x:labelX,y:yy+4,'text-anchor':index?'start':'end',fill:ink},tick.label);
    }
    add('text',{x:labelX,y:box.top+11,'text-anchor':index?'start':'end',fill:ink,class:'archive-axis-unit'},axis.key==='direction'?'Richt.':axis.unit);
   });
   if(configured)add('text',{x:left+6,y:box.top+15,class:'archive-area-label'},'Bereich '+area);
   const specs=shown.filter(spec=>config.assignments[spec.key]===area&&axes.some(axis=>axis.key===spec.axis)),bars=specs.filter(spec=>spec.type==='bar');
   for(const spec of [...bars,...specs.filter(spec=>spec.type!=='bar')]){
    const axis=axes.find(item=>item.key===spec.axis),marks=areaMarks[area];
    const y=value=>axis.key==='direction'?box.top+26+(value-axis.min)/(axis.max-axis.min)*(box.bottom-box.top-34):box.bottom-8-(value-axis.min)/(axis.max-axis.min)*(box.bottom-box.top-34);
    const points=spec.data.points,stroke=color(spec),coord=(point,value=point.value)=>[x(point.time),y(value)].join(',');
    if(spec.type==='bar'){
     for(const point of points){
      if(point.value<=0)continue;
      const span=point.last-point.first||spec.data.bucket_seconds||600;
      const slot=Math.min(44,Math.max(2,span/(end-start)*(right-left)*.8)),w=Math.max(1,slot/Math.max(1,bars.length));
      const zero=y(Math.max(axis.min,Math.min(axis.max,0)));
      add('rect',{x:x(point.time)-slot/2+bars.indexOf(spec)*w,y:Math.min(zero,y(point.value)),width:w,height:Math.abs(zero-y(point.value)),fill:stroke,opacity:point.incomplete?.4:.78,rx:1.2},undefined,marks);
     }
    }else if(spec.type==='point'){
     for(const point of points)add('circle',{cx:x(point.time),cy:y(point.value),r:2.5,fill:stroke},undefined,marks);
    }else{
     const groups=period?Layout.calendarSegments(points,period):WeatherLiveCardData.segments(points,Math.max(900,(spec.data.bucket_seconds||600)*2),spec.key==='temperature_c');
     for(const original of groups){
      const fields=period&&spec.key==='temperature_c'&&original.every(p=>Number.isFinite(p.minimum)&&Number.isFinite(p.maximum))?['value','minimum','maximum']:['value'];
      const group=WeatherLiveCardData.smoothSegment(original,[0,1,2,4,8,16][smoothing],fields);
      if(period&&spec.key==='temperature_c'&&group.length>1&&group.every(point=>Number.isFinite(point.minimum)&&Number.isFinite(point.maximum))){
       add('polygon',{points:group.map(point=>coord(point,point.maximum)).concat([...group].reverse().map(point=>coord(point,point.minimum))).join(' '),fill:stroke,opacity:.16},undefined,marks);
       for(const field of ['minimum','maximum'])add('path',{d:'M'+group.map(point=>coord(point,point[field])).join('L'),fill:'none',stroke:field==='maximum'?'#ff7777':'#77a9ef','stroke-width':1.2},undefined,marks);
      }
      if(group.length===1){add('circle',{cx:x(group[0].time),cy:y(group[0].value),r:2.5,fill:stroke},undefined,marks);continue}
      const curve=group;
      add('path',{d:'M'+curve.map(point=>coord(point)).join('L'),fill:'none',stroke,'stroke-width':2,'stroke-linejoin':'round','stroke-linecap':'round'},undefined,marks);
     }
    }
   }
  }
  const storms=(stormData?.points||[]).filter(point=>point.value>0);
  if(config.storm){
   const clip=add('clipPath',{id:'live-detail-storm-clip'},undefined,defs);
   add('rect',{x:left,y:0,width:right-left,height:layout.top},undefined,clip);
   const clipped=add('g',{'clip-path':'url(#live-detail-storm-clip)'});
   const group=add('g',{},undefined,clipped),settings=window.WeatherThunder?.getSettings?.();
   stormLayer=group;
   for(const point of storms){
    const strength=window.WeatherThunder?.classify(point.value,point.nearest,settings)||'normal';
    const icon=add('text',{x:x(point.time),y:21,'text-anchor':'middle',class:'archive-storm-icon is-'+strength},'⚡',group);
    add('title',{},stampLabel(point.time)+' · '+format(point.value,0)+' Blitze'+(point.nearest!==null&&point.nearest!==undefined?' · '+format(point.nearest)+' km':''),icon);
    if((right-left)/Math.max(1,storms.length)>54&&end-start<40*DAY){
     add('text',{x:x(point.time),y:32,'text-anchor':'middle',class:'archive-storm-count'},format(point.value,0),group);
     if(Number.isFinite(point.nearest))add('text',{x:x(point.time),y:44,'text-anchor':'middle',class:'archive-storm-distance'},format(point.nearest,0)+' km',group);
    }
   }
  }
  const cursor=add('line',{x1:left,x2:left,y1:config.storm?1:layout.top,y2:layout.bottom,class:'live-mini-cursor',visibility:'hidden','pointer-events':'none'});
  plot={...layout,width,start,end,x,cursor,axes:areaAxes,layers:[...Object.values(areaMarks),...(stormLayer?[stormLayer]:[]),...timeLayers],storms,budget:Math.max(40,height-layout.top-74)};
  for(const [id,position,value] of [['archiveUpperGrip',layout.separator,config.heights.upper],['archiveLowerGrip',layout.bottom+4,config.heights.lower]]){
   const grip=$(id);grip.hidden=false;grip.style.top=position+'px';grip.style.left=left+'px';grip.style.width=(right-left)+'px';grip.setAttribute('aria-valuenow',String(Math.round(value*100)));
  }
  if(drag)applyPan(drag.dx||0);
 }
 function drawTimeAxis(add,layout,x,start,end,defs,grid){
  const span=end-start,padding=span<=62*DAY?span:0;
  const tickKey=[start,end,layout.right-layout.left].join('|');
  if(timeAxisCache?.key!==tickKey)timeAxisCache={key:tickKey,ticks:Layout.timeTicks(start-padding,end+padding,(layout.right-layout.left)*(padding?3:1),span)};
  const ticks=timeAxisCache.ticks;
  const base=layout.bottom+8,layers=[];
  for(const [name,box] of [['upper',{top:layout.top,bottom:layout.areas.B.bottom}],['lower',layout.areas.C]]){
   const clip=add('clipPath',{id:'live-detail-grid-'+name},undefined,defs);
   add('rect',{x:layout.left,y:box.top,width:layout.right-layout.left,height:box.bottom-box.top},undefined,clip);
   const clipped=add('g',{'clip-path':'url(#live-detail-grid-'+name+')'},undefined,grid),lines=add('g',{},undefined,clipped);
   layers.push(lines);
   const positions=new Map(ticks.ticks.map(tick=>[tick.time,tick.major]));
   for(const midnight of ticks.midnights)positions.set(midnight,true);
   for(const [time,major] of positions){
    const xx=x(time);
    add('line',{x1:xx,x2:xx,y1:box.top,y2:box.bottom,class:'live-detail-grid live-time-grid'+(major?' is-midnight':''),'data-time':time},undefined,lines);
   }
  }
  const clip=add('clipPath',{id:'live-detail-time-labels'},undefined,defs);
  add('rect',{x:layout.left-1,y:base,width:layout.right-layout.left+2,height:54},undefined,clip);
  const clipped=add('g',{'clip-path':'url(#live-detail-time-labels)'}),labels=add('g',{},undefined,clipped);
  layers.push(labels);
  for(const group of ticks.groups){
   const xx=x(group.start);
   add('line',{x1:xx,x2:xx,y1:base+33,y2:base+53,class:'archive-group-boundary'},undefined,labels);
  }
  for(const tick of ticks.ticks){
   const xx=x(tick.time),yy=base+(ticks.rotate?12:20);
   add('line',{x1:xx,x2:xx,y1:base,y2:base+5,class:'live-detail-grid','data-time':tick.time},undefined,labels);
   add('text',{x:xx,y:yy,'text-anchor':ticks.rotate?'end':'middle',transform:ticks.rotate?`rotate(-40 ${xx} ${yy})`:'','data-time':tick.time,class:'archive-time-label'},tick.label,labels);
  }
  for(const group of ticks.groups){
   const first=Math.max(start,group.start??start),last=Math.min(end,group.end??end);
   const center=last>first?(first+last)/2:group.time;
   add('text',{x:x(center),y:base+47,'text-anchor':'middle',class:'archive-date-group'},group.label,labels);
  }
  return layers;
 }
 function pointer(event){
  const matrix=svg.getScreenCTM();if(!matrix)return null;
  const point=svg.createSVGPoint();point.x=event.clientX;point.y=event.clientY;
  return point.matrixTransform(matrix.inverse());
 }
 function hideTip(){tip.hidden=true;plot?.cursor.setAttribute('visibility','hidden')}
 function showTip(event){
  if(!plot)return;
  const position=pointer(event);if(!position)return;
  if(position.x<plot.left||position.x>plot.right||position.y>plot.bottom){hideTip();return}
  const target=plot.start+(position.x-plot.left)/(plot.right-plot.left)*(plot.end-plot.start);
  plot.cursor.setAttribute('x1',position.x);plot.cursor.setAttribute('x2',position.x);plot.cursor.setAttribute('visibility','visible');
  tip.replaceChildren();
  const title=document.createElement('strong');
  title.textContent=shownWindow.period==='month'?dateLabel(target,{month:'long',year:'numeric'}):
   shownWindow.period==='day'?dateLabel(target,{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}):stampLabel(target);
  tip.append(title);
  for(const spec of shown){
   const point=spec.data.points.reduce((a,b)=>Math.abs(a.time-target)<Math.abs(b.time-target)?a:b);
   const tolerance=shownWindow.period?0:Math.max(spec.data.bucket_seconds||600,900);
   if(target<point.first-tolerance||target>point.last+tolerance)continue;
   const row=document.createElement('div');row.style.borderLeftColor=color(spec);row.style.color=color(spec);
   row.textContent=spec.label+' '+(spec.axis==='direction'?Layout.compass(point.value)+' · ':'')+format(point.value)+(spec.unit?' '+spec.unit:'')+
    (shownWindow.period&&spec.key==='temperature_c'?' · Min '+format(point.minimum??point.value)+' / Max '+format(point.maximum??point.value):'')+
    (point.incomplete?' · unvollständig':'');
   tip.append(row);
  }
  const storm=plot.storms.find(point=>target>=point.first&&target<=point.last);
  if(storm){const row=document.createElement('div');row.textContent='⚡ '+dateLabel(storm.time,{day:'2-digit',month:'2-digit'})+' · '+format(storm.value,0)+' Blitze'+(Number.isFinite(storm.nearest)?' · '+format(storm.nearest)+' km':'');tip.append(row)}
  tip.hidden=false;tip.style.left=Math.max(4,Math.min(position.x+12,plot.width-tip.offsetWidth-6))+'px';
  tip.style.top=Math.max(4,Math.min(canvas.scrollTop+12,plot.bottom-tip.offsetHeight))+'px';
 }
 function showWindow(window,autoResolution=false){
  config.range='custom';config.start=localInput(window.start);config.end=localInput(window.end);
  config.resolution=autoResolution?'auto':shownWindow?.period||'auto';range.value='custom';reflect();dirty();load();
 }
 function shift(fraction){
  if(shownWindow)showWindow(Layout.shifted(shownWindow,fraction));
 }
 svg.onpointerdown=event=>{
  if(event.button!==0||!plot)return;
  const point=pointer(event);if(!point||point.x<plot.left||point.x>plot.right)return;
  svg.setPointerCapture(event.pointerId);
  if(event.pointerType==='touch'){
   touchPoints.set(event.pointerId,point.x);
   if(touchPoints.size===2){
    const [a,b]=[...touchPoints.values()];
    pinch={window:{...shownWindow},distance:Math.max(8,Math.abs(b-a)),anchor:((a+b)/2-plot.left)/(plot.right-plot.left),axes:plot.axes};
    drag=null;suppressTouch=true;hideTip();event.preventDefault();return;
   }
   if(suppressTouch)return;
  }
  if(pan){drag={id:event.pointerId,x:point.x,dx:0,width:plot.right-plot.left,axes:plot.axes,window:shownWindow};hideTip()}
  else showTip(event);
 };
 function applyPan(move){
  if(!plot)return;
  for(const layer of plot.layers)layer.setAttribute('transform','translate('+move+',0)');
 }
 svg.onpointermove=event=>{
  if(touchPoints.has(event.pointerId)){
   const point=pointer(event);if(!point)return;touchPoints.set(event.pointerId,point.x);
   if(pinch&&touchPoints.size>=2&&plot){
    event.preventDefault();const [a,b]=[...touchPoints.values()];
    const target=Layout.zoomed(pinch.window,Math.max(8,Math.abs(b-a))/pinch.distance,pinch.anchor,((a+b)/2-plot.left)/(plot.right-plot.left));
    shownWindow={...pinch.window,...target};hideTip();scheduleDraw();return;
   }
   if(suppressTouch)return;
  }
  if(drag&&plot){
   const point=pointer(event);if(!point)return;
   drag.dx=point.x-drag.x;applyPan(drag.dx);
   if(Math.abs(drag.dx)>drag.width*.2){
    const target=Layout.shifted(drag.window,-drag.dx/drag.width);
    queueWarm([{...drag.window,...target}]);
   }
  }else showTip(event);
 };
 function finishPan(event,cancelled){
  if(drag&&plot){
   const point=pointer(event),move=point?point.x-drag.x:drag.dx,window=drag.window,width=drag.width;
   drag=null;
   if(!cancelled&&Math.abs(move)>4)showWindow(Layout.shifted(window,-move/width));
   else draw();
  }
  if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
 }
 function finishTouch(event,cancelled){
  touchPoints.delete(event.pointerId);
  if(pinch){
   const original=pinch.window,target=shownWindow;pinch=null;drag=null;
   if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);
   if(cancelled){shownWindow=original;draw()}else showWindow(target,true);
   if(!touchPoints.size)suppressTouch=false;
   return;
  }
  if(suppressTouch){if(!touchPoints.size)suppressTouch=false;if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId);return}
  finishPan(event,cancelled);
 }
 svg.onpointerup=event=>finishTouch(event,false);
 svg.onpointercancel=event=>{finishTouch(event,true);hideTip()};
 svg.addEventListener('wheel',event=>{
  if(!event.ctrlKey||!plot)return;
  event.preventDefault();hideTip();const point=pointer(event);if(!point)return;
  const anchor=Math.max(0,Math.min(1,(point.x-plot.left)/(plot.right-plot.left)));
  shownWindow={...shownWindow,...Layout.zoomed(shownWindow,Math.exp(-event.deltaY*.005),anchor)};
  scheduleDraw();clearTimeout(wheelTimer);wheelTimer=setTimeout(()=>showWindow(shownWindow,true),220);
 },{passive:false});
 svg.onpointerleave=()=>{if(!drag)hideTip()};
 svg.ondblclick=()=>goNow();
 function goNow(){
  if(config.range==='custom'){config.range=lastRange;config.mode=lastMode}
  reflect();dirty();load(true);
 }
 function resizeGrip(id,key,min){
  const grip=$(id);let resize=null;
  grip.onpointerdown=event=>{
   if(event.button!==0||!plot)return;
   event.preventDefault();hideTip();grip.setPointerCapture(event.pointerId);
   const total=config.heights.upper+config.heights.lower;config.heights.upper/=total;config.heights.lower/=total;
   resize={pointer:event.pointerId,y:event.clientY,value:config.heights[key],budget:plot.budget};
  };
  grip.onpointermove=event=>{
   if(resize?.pointer!==event.pointerId)return;
   config.heights[key]=Math.max(min,Math.min(1-(key==='upper'?.12:.2),resize.value+(event.clientY-resize.y)/resize.budget));config.heights[key==='upper'?'lower':'upper']=1-config.heights[key];draw();
  };
  const finish=event=>{if(resize?.pointer!==event.pointerId)return;resize=null;if(grip.hasPointerCapture(event.pointerId))grip.releasePointerCapture(event.pointerId);dirty()};
  grip.onpointerup=finish;grip.onpointercancel=finish;
  grip.onkeydown=event=>{
   if(!['ArrowUp','ArrowDown'].includes(event.key))return;
   event.preventDefault();config.heights[key]=Math.max(min,Math.min(1-(key==='upper'?.12:.2),config.heights[key]+(event.key==='ArrowDown'?.03:-.03)));config.heights[key==='upper'?'lower':'upper']=1-config.heights[key];dirty();draw();
  };
 }
 resizeGrip('archiveUpperGrip','upper',.2);resizeGrip('archiveLowerGrip','lower',.12);
 new ResizeObserver(scheduleDraw).observe(canvas);
 function saveView(){
  const name=$('archiveViewName').value.trim();
  if(!name){status.textContent='Bitte einen Namen für die Ansicht eingeben.';$('archiveViewName').focus();return}
  if(!Layout.valid(config)){status.textContent='Zeitraum und Skalen prüfen.';return}
  try{plotWindow()}catch(error){status.textContent=error.message;return}
  const saved=views(),id=activeView||crypto.randomUUID();
  if(!activeView&&Object.keys(saved).length>=30){status.textContent='Bis zu 30 Ansichten möglich. Bitte zuerst eine bestehende Ansicht löschen.';return}
  saved[id]={name,config:clone(config)};
  try{localStorage.setItem(VIEWS,JSON.stringify(saved));activeView=id;fillViews();storeDraft();status.textContent='Ansicht gespeichert. Für andere Geräte unter Daten & Synchronisation die App-Einstellungen abgleichen.'}
  catch(error){status.textContent='Die Ansicht konnte nicht gespeichert werden. Gerätespeicher prüfen.'}
 }
 $('archiveSaveView').onclick=saveView;
 $('archiveNewView').onclick=()=>{activeView='';fillViews();$('archiveViewName').value='';$('archiveViewName').focus();storeDraft()};
 $('archiveDeleteView').onclick=()=>{
  const saved=views();if(!saved[activeView]||!confirm('Gespeicherte Ansicht «'+saved[activeView].name+'» löschen?'))return;
  delete saved[activeView];
  try{localStorage.setItem(VIEWS,JSON.stringify(saved));activeView='';fillViews();$('archiveViewName').value='';storeDraft();status.textContent='Ansicht gelöscht.'}catch(error){status.textContent='Die Änderung konnte nicht gespeichert werden.'}
 };
 view.onchange=()=>{
  activeView=view.value;const saved=views()[activeView];
  if(!saved){$('archiveViewName').value='';$('archiveDeleteView').disabled=true;storeDraft();return}
  config=clone(saved.config);$('archiveViewName').value=saved.name;
  lastRange=config.range==='custom'?'24':config.range;lastMode=config.mode;
  reflect();dirty();$('archiveDeleteView').disabled=false;
  load();
 };
 $('archiveConfigure').onclick=()=>setConfiguration(!configured);
 $('archivePan').onclick=()=>{
  pan=!pan;$('archivePan').setAttribute('aria-pressed',String(pan));canvas.classList.toggle('is-panning',pan);hideTip();
  status.textContent=pan?'Zeitachse mit Maus oder Finger ziehen. Doppelklick oder «Jetzt» kehrt zum aktuellen Zeitraum zurück.':'Werte mit Maus oder Finger anzeigen.';
 };
 $('archiveBack').onclick=()=>shift(-1);$('archiveForward').onclick=()=>shift(1);$('archiveNow').onclick=goNow;
 station.onchange=()=>{config.station=station.value;dirty();load()};
 range.onchange=()=>{
  config.range=range.value;
  if(config.range!=='custom'){lastRange=config.range;lastMode=config.mode}else setConfiguration(true);
  updateRange();dirty();load();
 };
 mode.onchange=()=>{config.mode=mode.value;lastMode=config.mode;dirty();load()};
 for(const [id,key] of [['archiveStart','start'],['archiveEnd','end'],['archiveResolution','resolution']])$(id).onchange=()=>{config[key]=$(id).value;dirty();load()};
 $('archiveStorm').onchange=()=>{config.storm=$('archiveStorm').checked;dirty();load()};
 $('archiveBRatio').onchange=()=>{config.heights.b=+$('archiveBRatio').value;dirty();draw()};
 $('archiveRefresh').onclick=()=>load(true);
 $('openLiveArchive').onclick=()=>{
  if(dialog.open)return;
  if(!opened){
   config.station=$('liveStation').value;config.range=$('liveCardRange').value;config.mode=$('liveRangeMode').value;opened=true;
  }
  if(config.range!=='custom')lastRange=config.range;
  lastMode=config.mode;fillViews();$('archiveViewName').value=views()[activeView]?.name||'';
  reflect();setConfiguration(false);dialog.showModal();load(true);
  refreshTimer=setInterval(()=>{if(!document.hidden&&config.range!=='custom'&&!drag&&!pinch)load(true)},300000);
 };
 $('closeLiveArchive').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{
  clearInterval(refreshTimer);clearTimeout(wheelTimer);touchPoints.clear();pinch=null;suppressTouch=false;clearTimeout(warmTimer);warmTimer=null;warmTargets=[];warmController?.abort();revision++;controller?.abort();hideTip();drag=null;storeDraft();
 });
 window.addEventListener('weather-live-connection-changed',()=>{if(dialog.open)load(true)});
 window.addEventListener('weather-thunder-changed',()=>{if(dialog.open)draw()});
 window.addEventListener('storage',event=>{if(event.key===VIEWS)fillViews()});
})();
