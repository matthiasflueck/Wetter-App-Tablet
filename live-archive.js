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
  return ['/catalog','/series'].includes(path)?schedule(run,options.signal):run();
 }
 window.WeatherNasArchive={request,connected:()=>!!connection};
 $('nasForm').onsubmit=async e=>{e.preventDefault();const button=$('nasForm').querySelector('button');button.disabled=true;$('nasStatus').textContent='NAS-Verbindung wird geprüft …';const previous=connection;try{const next=validate($('nasUrl').value.trim(),$('nasToken').value.trim());if(tablet){connection=next;await request('/catalog');if($('nasRemember').checked)localStorage.setItem('wetter.nasConnection',JSON.stringify(next));else localStorage.removeItem('wetter.nasConnection')}else{const r=await fetch('/api/nas/config',{method:'POST',headers:{'Content-Type':'application/json','X-Wetter-Token':$('nasForm').dataset.token},body:JSON.stringify(next)});const result=await r.json();if(!r.ok)throw Error(result.message);connection={url:result.url}}$('nasToken').value='';$('nasStatus').textContent='NAS verbunden. Aktuelle Messwerte und Live-Verlauf verwenden das separate NAS-Archiv.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(error){connection=previous;$('nasStatus').textContent=error.message}finally{button.disabled=false}};
 $('nasDisconnect').onclick=async()=>{try{if(tablet)localStorage.removeItem('wetter.nasConnection');else{const r=await fetch('/api/nas/config',{method:'POST',headers:{'Content-Type':'application/json','X-Wetter-Token':$('nasForm').dataset.token},body:JSON.stringify({disconnect:true})});if(!r.ok)throw Error('Verbindung konnte nicht getrennt werden.')}connection=null;$('nasStatus').textContent='App-Verbindung getrennt. Die Aufzeichnung auf dem NAS läuft weiter.';window.dispatchEvent(new Event('weather-live-connection-changed'))}catch(e){$('nasStatus').textContent=e.message}};

 (async()=>{try{if(tablet){const saved=JSON.parse(localStorage.getItem('wetter.nasConnection')||'null');if(saved)connection=validate(saved.url,saved.token);$('nasRemember').checked=!!connection}else{const state=await request('/config');if(state.configured)connection={url:state.url};$('nasRemember').closest('label').hidden=true}if(connection){$('nasUrl').value=connection.url;$('nasStatus').textContent='NAS-Verbindung eingerichtet. Zum Ändern Lesezugang erneut eingeben.';window.dispatchEvent(new Event('weather-live-connection-changed'))}else $('nasStatus').textContent='Noch nicht eingerichtet. Sammler auf dem NAS starten und hier verbinden.'}catch(e){$('nasStatus').textContent='NAS-Verbindung noch nicht eingerichtet.'}})();
})();

/* Multi-series detail view, using the same independent live archive as the tiles. */
(()=>{
 const $=id=>document.getElementById(id);
 const dialog=$('liveArchiveDialog'),svg=$('archivePlot'),tip=$('archiveTooltip');
 const station=$('archiveStation'),range=$('archiveRange'),mode=$('archiveMode'),status=$('archiveStatus');
 const metrics=$('archiveMetrics'),scales=$('archiveScales'),day=86400;
 const kinds={temperature_c:'thermohygro',humidity_percent:'thermohygro',rain_total_mm:'rain',wind_kmh:'wind',gust_kmh:'wind',wind_direction_degrees:'wind',pressure_hpa:'pressure',solar_wm2:'solar',uv_index:'solar',lightning_count:'lightning',lightning_distance_km:'lightning'};
 const definitions=[
  ['temperature_c','Temperatur','°C','line','#e39062'],
  ['humidity_percent','Luftfeuchte','%','line','#55bca9'],
  ['rain_total_mm','Niederschlag','mm','bar','#4f9dcc'],
  ['wind_kmh','Wind Mittel','km/h','line','#42bca0'],
  ['gust_kmh','Böe','km/h','line','#e2aa55'],
  ['wind_direction_degrees','Windrichtung','°','point','#a0b778'],
  ['pressure_hpa','Stationsdruck','hPa','line','#a797d4'],
  ['solar_wm2','Solarstrahlung','W/m²','bar','#e1b147'],
  ['uv_index','UV-Index','','line','#c78cd0'],
  ['lightning_count','Blitze','', 'bar','#b57cda'],
  ['lightning_distance_km','Blitzentfernung','km','point','#72d6cc'],
 ];
 const rangeOptions=[['1','Letzte Stunde'],['2','Letzte 2 Stunden'],['6','Letzte 6 Stunden'],
  ['24','Letzte 24 Stunden'],['168','Letzte 7 Tage'],['720','Monat'],['8760','Jahr'],['custom','Freier Zeitraum']];
 rangeOptions.forEach(([value,label])=>range.add(new Option(label,value)));
 range.value='24';
 station.replaceChildren(...Array.from($('liveStation').children,n=>n.cloneNode(true)));
 const localParts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
 const localInput=stamp=>localParts.format(new Date(stamp*1000)).replace(' ','T');
 function parseSwiss(value){
  if(!value)return NaN;
  const nominal=Date.parse(value+'Z')/1000;
  if(!Number.isFinite(nominal))return NaN;
  let stamp=nominal;
  for(let i=0;i<3;i++)stamp+=nominal-Date.parse(localInput(stamp)+'Z')/1000;
  return localInput(stamp)===value?stamp:NaN;
 }
 const format=(value,digits=1)=>value.toLocaleString('de-CH',{maximumFractionDigits:digits});
 const stampLabel=stamp=>new Date(stamp*1000).toLocaleString('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
 let colors={};
 try{colors=JSON.parse(localStorage.getItem('wetter.liveDetailColors')||'{}')||{}}catch(error){}
 const seriesColor=spec=>/^#[a-f\d]{6}$/i.test(colors[spec.key])?colors[spec.key]:spec.color;
 let selected=new Set(['temperature_c']),available=[],source=null,shown=[],shownWindow=null;
 let controller=null,revision=0,windowKey='',loaded=new Map(),refreshTimer=null;
 function request(path,query,signal,code=station.value){
  return code?WeatherNasArchive.request('/meteoswiss',{...query,station:code,action:path.slice(1)},{signal}):WeatherNasArchive.request(path,query,{signal});
 }
 function begin(){
  controller?.abort();
  controller=new AbortController();
  return {id:++revision,signal:controller.signal};
 }
 async function getSource(signal,code){
  const current=window.WeatherCurrentLiveState?.();
  const live=current&&(current.station||'')===code?current:await request('/live',null,signal,code);
  const catalog=await request('/catalog',null,signal,code);
  const ownSensors=new Map(live.sensors.map(sensor=>[sensor.key,sensor]));
  const series=definitions.flatMap(([key,label,unit,type,color])=>{
   const metric=key==='lightning_distance_km'?'lightning_count':key;
   const archive=catalog.series.find(s=>s.metric===metric&&ownSensors.get(s.sensor)?.kind===kinds[key]);
   return archive?[{key,label,unit,type,color,archive}]:[];
  });
  return {code,series,observedEnd:live.observed_end};
 }
 function makeControls(){
  metrics.replaceChildren();
  for(const spec of available){
   const group=document.createElement('div'),label=document.createElement('label'),check=document.createElement('input'),color=document.createElement('input');
   group.className='live-detail-metric';group.style.setProperty('--series',seriesColor(spec));
   check.type='checkbox';check.checked=selected.has(spec.key);label.append(check,spec.label);
   color.type='color';color.value=seriesColor(spec);color.setAttribute('aria-label','Farbe '+spec.label);
   check.onchange=()=>{if(check.checked)selected.add(spec.key);else selected.delete(spec.key);load()};
   color.oninput=()=>{
    colors[spec.key]=color.value;group.style.setProperty('--series',color.value);
    try{localStorage.setItem('wetter.liveDetailColors',JSON.stringify(colors))}catch(error){}
    draw();
   };
   group.append(label,color);metrics.append(group);
  }
 }
 function updateRange(){
  const custom=range.value==='custom',long=['720','8760'].includes(range.value);
  $('archiveModeLabel').hidden=!long;
  for(const label of dialog.querySelectorAll('[data-archive-custom]'))label.hidden=!custom;
  if(long){
   mode.options[0].text=range.value==='720'?'Letzte 30 Tage':'Letzte 12 Monate';
   mode.options[1].text=range.value==='720'?'Kalendermonat':'Kalenderjahr';
  }
  if(custom&&!$('archiveStart').value){
   const end=Date.now()/1000;
   $('archiveStart').value=localInput(end-day);$('archiveEnd').value=localInput(end);
  }
 }
 function plotWindow(){
  const now=Date.now()/1000,observed=Math.min(now,source.observedEnd??now),selection=range.value;
  if(selection!=='custom'){
   const window=WeatherLiveCardData.rangeWindow(observed,selection,mode.value);
   return {...window,period:selection==='720'?'day':selection==='8760'?'month':null};
  }
  const start=parseSwiss($('archiveStart').value),end=parseSwiss($('archiveEnd').value);
  if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw Error('Bitte einen gültigen Zeitraum in Schweizer Ortszeit wählen.');
  if(end-start>366*day)throw Error('Pro Ansicht sind höchstens 366 Tage möglich.');
  if(source.code&&start<now-370*day)throw Error('Für MeteoSchweiz sind die letzten 370 Tage verfügbar.');
  const resolution=$('archiveResolution').value,span=end-start;
  const period=resolution==='auto'?(span>90*day?'month':span>7*day?'day':null):resolution==='raw'?null:resolution;
  if(source.code&&!period&&span>10*day)throw Error('Für mehr als zehn Tage bei MeteoSchweiz bitte täglich oder monatlich wählen.');
  return {start,end,observedEnd:Math.min(end,observed),period};
 }
 async function seriesData(spec,window,signal,code,pending){
  const {start,observedEnd,period}=window;
  if(observedEnd<=start)return {points:[]};
  const archive=spec.archive,storm=spec.key.startsWith('lightning_');
  const aggregation=storm?'lightning_events':spec.key==='rain_total_mm'?'rain_increment':period?'calendar':null;
  const query={provider:archive.provider,sensor:archive.sensor,metric:archive.metric,unit:archive.unit,start,end:observedEnd};
  if(aggregation)query.aggregation=aggregation;
  if(period)query.period=period;
  if(storm||spec.key==='rain_total_mm')query.bucket_seconds=Math.max(60,Math.ceil((observedEnd-start)/140));
  const key=JSON.stringify(query);
  if(!loaded.has(key)&&!pending.has(key)){
   const cache=loaded;
   pending.set(key,request('/series',query,signal,code).then(data=>{cache.set(key,data);return data}));
  }
  const data=loaded.get(key)??await pending.get(key);
  const points=data.points.map(p=>{
   const value=spec.key==='lightning_distance_km'?p.nearest:spec.key==='gust_kmh'?(p.maximum??p.value):p.value;
   const time=p.time??(p.first+p.last)/2;
   return {...p,value,time};
  }).filter(p=>Number.isFinite(p.value));
  return {...data,points};
 }
 async function load(force=false){
  if(!dialog.open)return;
  const {id,signal}=begin(),code=station.value;
  try{
   if(force||source?.code!==code){
    source=null;available=[];metrics.replaceChildren();shown=[];draw();
    status.textContent='Wetterstation wird geladen …';
    const result=await getSource(signal,code);
    if(id!==revision)return;
    source=result;available=result.series;
    if(!available.some(spec=>selected.has(spec.key))&&available.length)selected.add(available[0].key);
    makeControls();
   }
   const window=plotWindow();
   const key=JSON.stringify([code,range.value,mode.value,$('archiveStart').value,$('archiveEnd').value,$('archiveResolution').value]);
   if(force||key!==windowKey){loaded=new Map();windowKey=key;shown=[];draw()}
   // Freeze the time window while toggling series so completed requests are reused.
   const activeWindow=shownWindow&&shownWindow.key===key&&!force?shownWindow:{...window,key};
   shownWindow=activeWindow;
   const specs=available.filter(spec=>selected.has(spec.key));
   if(!specs.length){
    shown=[];draw();status.textContent=available.length?'Wähle eine oder mehrere Messgrössen.':'Für diese Station sind keine Kacheldaten verfügbar.';return;
   }
   status.textContent='Verlauf wird geladen …';
   const pending=new Map();
   const results=await Promise.allSettled(specs.map(async spec=>({...spec,data:await seriesData(spec,activeWindow,signal,code,pending)})));
   if(id!==revision)return;
   shown=results.flatMap(result=>result.status==='fulfilled'&&result.value.data.points.length?[result.value]:[]);
   draw();
   const missing=specs.filter(spec=>!shown.some(item=>item.key===spec.key)).map(spec=>spec.label);
   status.textContent=!shown.length?(results.some(r=>r.status==='rejected')?'Der Verlauf konnte nicht geladen werden.':'Keine Messwerte im gewählten Zeitraum.'):
    (missing.length?'Keine Daten oder Abruffehler bei '+missing.join(', ')+'. ':'')+
    (activeWindow.period==='month'?'Monatswerte':activeWindow.period==='day'?'Tageswerte':'Feine Auflösung')+
    ' · Schweizer Ortszeit'+(code&&activeWindow.period&&shown.some(s=>s.key==='rain_total_mm')?' · Regen-Tagesgrenze 06:00 UTC':'');
  }catch(error){
   if(id!==revision)return;
   shown=[];draw();status.textContent=error.name==='AbortError'?'Das NAS antwortet nicht.':error.message;
  }
 }
 function draw(){
  svg.replaceChildren();scales.replaceChildren();tip.hidden=true;
  svg.onpointermove=svg.onpointerdown=svg.onpointerup=svg.onpointerleave=svg.onpointercancel=null;
  if(!shown.length||!shownWindow)return;
  const {start,end,period}=shownWindow;
  const width=Math.max(280,Math.round(svg.clientWidth)),height=Math.max(240,Math.round(svg.clientHeight));
  const axes=new Map(),axisKey=s=>s.unit||s.key;
  for(const spec of shown){
   const key=axisKey(spec);
   if(!axes.has(key))axes.set(key,{unit:spec.unit||spec.label,series:[],min:Infinity,max:-Infinity,zero:false});
   const axis=axes.get(key);
   axis.series.push(spec);
   axis.zero ||= spec.type!=='line'||['uv_index','wind_kmh','gust_kmh'].includes(spec.key);
   for(const p of spec.data.points){
    const envelope=period&&spec.key==='temperature_c';
    axis.min=Math.min(axis.min,envelope?p.minimum??p.value:p.value);
    axis.max=Math.max(axis.max,envelope?p.maximum??p.value:p.value);
   }
  }
  for(const axis of axes.values()){
   const pad=Math.max((axis.max-axis.min)*.08,.5);
   axis.min=axis.zero?0:axis.min-pad;
   axis.max=Math.max(axis.min+1,axis.max+pad);
   if(axis.unit==='°')axis.max=360;
   const label=document.createElement('span');
   label.textContent=axis.series.map(s=>s.label).join(' / ')+' · '+format(axis.min)+'–'+format(axis.max)+' '+(axis.series[0].unit||'');
   label.style.borderColor=seriesColor(axis.series[0]);scales.append(label);
  }
  const axisList=[...axes.values()],left=49,right=width-(axisList.length>1?49:13),top=27,bottom=height-34;
  const x=t=>left+(t-start)/(end-start)*(right-left);
  const y=(v,axis)=>bottom-(v-axis.min)/(axis.max-axis.min)*(bottom-top);
  const ns='http://www.w3.org/2000/svg';
  const add=(tag,attrs={},text,parent=svg)=>{
   const node=document.createElementNS(ns,tag);
   for(const [name,value] of Object.entries(attrs))node.setAttribute(name,value);
   if(text!==undefined)node.textContent=text;
   parent.append(node);return node;
  };
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  add('rect',{x:left,y:top,width:right-left,height:bottom-top,class:'plot-background','data-plot-background':''});
  const defs=add('defs'),clip=add('clipPath',{id:'live-detail-plot-clip'},undefined,defs);
  add('rect',{x:left,y:top,width:right-left,height:bottom-top},undefined,clip);
  const ticks=4;
  for(let i=0;i<=ticks;i++){
   const f=i/ticks,yy=bottom-f*(bottom-top);
   add('line',{x1:left,x2:right,y1:yy,y2:yy,class:'live-detail-grid'});
   for(const [j,axis] of axisList.slice(0,2).entries()){
    const attrs={x:j?right+6:left-6,y:yy+4,'text-anchor':j?'start':'end',fill:seriesColor(axis.series[0])};
    add('text',attrs,format(axis.min+f*(axis.max-axis.min)));
    if(i===ticks)add('text',{...attrs,y:14},axis.unit);
   }
  }
  const tickCount=Math.max(2,Math.min(8,Math.floor((right-left)/95)));
  const dateOptions=end-start<day?{hour:'2-digit',minute:'2-digit'}:period==='month'?{month:'short',year:'2-digit'}:{day:'2-digit',month:'2-digit'};
  const dateFormat=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',...dateOptions});
  for(let i=0;i<=tickCount;i++){
   const t=start+i*(end-start)/tickCount,xx=x(t);
   add('line',{x1:xx,x2:xx,y1:top,y2:bottom,class:'live-detail-grid'});
   add('text',{x:xx,y:bottom+20,'text-anchor':i===0?'start':i===tickCount?'end':'middle'},dateFormat.format(new Date(t*1000)));
  }
  const bars=shown.filter(s=>s.type==='bar'),layers=[...bars,...shown.filter(s=>s.type!=='bar')];
  const marks=add('g',{'clip-path':'url(#live-detail-plot-clip)'});
  for(const spec of layers){
   const points=spec.data.points,axis=axes.get(axisKey(spec)),color=seriesColor(spec);
   const coord=(p,value=p.value)=>[x(p.time),y(value,axis)].join(',');
   if(spec.type==='bar'){
    const index=bars.indexOf(spec);
    for(const p of points){
     if(p.value<=0)continue;
     const span=p.last-p.first||spec.data.bucket_seconds||600;
     const slot=Math.min(34,Math.max(2,span/(end-start)*(right-left)*.76));
     const w=Math.max(1,slot/bars.length);
     add('rect',{x:x(p.time)-slot/2+index*w,y:y(p.value,axis),width:w,height:bottom-y(p.value,axis),fill:color,opacity:p.incomplete?.38:.76,rx:1.5},undefined,marks);
    }
   }else if(spec.type==='point'){
    for(const p of points){
     const r=spec.key==='lightning_distance_km'?2.4+3.6*(1-Math.min(40,Math.max(0,p.value))/40):2.5;
     add('circle',{cx:x(p.time),cy:y(p.value,axis),r,fill:color},undefined,marks);
    }
   }else{
    const groups=WeatherLiveCardData.segments(points,period?1:Math.max(900,(spec.data.bucket_seconds||600)*2),spec.key==='temperature_c'&&!period);
    for(const group of groups){
     if(period&&spec.key==='temperature_c'&&group.length>1&&group.every(p=>Number.isFinite(p.minimum)&&Number.isFinite(p.maximum))){
      const band=group.map(p=>coord(p,p.maximum)).concat([...group].reverse().map(p=>coord(p,p.minimum)));
      add('polygon',{points:band.join(' '),fill:color,opacity:.18},undefined,marks);
      for(const field of ['minimum','maximum']){
       add('path',{d:'M'+group.map(p=>coord(p,p[field])).join('L'),fill:'none',stroke:color,'stroke-opacity':.62,'stroke-width':1.15},undefined,marks);
      }
     }
     if(group.length===1){const p=group[0];add('circle',{cx:x(p.time),cy:y(p.value,axis),r:2.5,fill:color},undefined,marks);continue}
     const wind=['wind_kmh','gust_kmh'].includes(spec.key);
     const radius=wind?(range.value==='168'?3:range.value==='24'?2:period?1:0):0;
     const curve=WeatherLiveCardData.smoothSegment(group,radius);
     add('path',{d:'M'+curve.map(p=>coord(p)).join('L'),fill:'none',stroke:color,'stroke-width':2.2,'stroke-linejoin':'round','stroke-linecap':'round'},undefined,marks);
    }
   }
  }
  const cursor=add('line',{x1:left,x2:left,y1:top,y2:bottom,class:'live-mini-cursor',visibility:'hidden','pointer-events':'none'});
  const hide=()=>{tip.hidden=true;cursor.setAttribute('visibility','hidden')};
  const show=event=>{
   const matrix=svg.getScreenCTM();if(!matrix)return;
   const pointer=svg.createSVGPoint();pointer.x=event.clientX;pointer.y=event.clientY;
   const px=Math.max(left,Math.min(right,pointer.matrixTransform(matrix.inverse()).x));
   const target=start+(px-left)/(right-left)*(end-start);
   const hits=shown.flatMap(spec=>{
    const points=spec.data.points,p=points.reduce((a,b)=>Math.abs(a.time-target)<Math.abs(b.time-target)?a:b);
    const tolerance=period?0:Math.max(spec.data.bucket_seconds||600,900);
    return target>=p.first-tolerance&&target<=p.last+tolerance?[{spec,p}]:[];
   });
   if(!hits.length){hide();return}
   const anchor=hits.reduce((a,b)=>Math.abs(a.p.time-target)<Math.abs(b.p.time-target)?a:b).p.time;
   cursor.setAttribute('x1',x(anchor));cursor.setAttribute('x2',x(anchor));cursor.setAttribute('visibility','visible');
   tip.replaceChildren();
   const label=document.createElement('strong');label.textContent=stampLabel(anchor);tip.append(label);
   for(const {spec,p} of hits){
    const row=document.createElement('div');row.style.borderLeftColor=seriesColor(spec);
    const suffix=period&&spec.key==='temperature_c'&&Number.isFinite(p.minimum)&&Number.isFinite(p.maximum)
     ?' · Min '+format(p.minimum)+' / Max '+format(p.maximum):'';
    row.textContent=spec.label+' · '+format(p.value)+(spec.unit?' '+spec.unit:'')+suffix+(p.incomplete?' · unvollständig':'');
    tip.append(row);
   }
   tip.hidden=false;
   tip.style.left=Math.max(4,Math.min(px+10,width-tip.offsetWidth-4))+'px';
  };
  svg.onpointermove=show;
  svg.onpointerdown=event=>{show(event);if(event.pointerType==='touch')svg.setPointerCapture(event.pointerId)};
  svg.onpointerup=event=>{if(svg.hasPointerCapture(event.pointerId))svg.releasePointerCapture(event.pointerId)};
  svg.onpointerleave=svg.onpointercancel=hide;
 }
 const resize=new ResizeObserver(()=>{if(dialog.open)draw()});resize.observe(svg);
 $('openLiveArchive').onclick=()=>{
  if(dialog.open)return;
  station.value=$('liveStation').value;
  range.value=$('liveCardRange').value;
  mode.value=$('liveRangeMode').value;
  updateRange();dialog.showModal();load(true);
  refreshTimer=setInterval(()=>{
   if(!document.hidden&&range.value!=='custom'&&!status.textContent.includes('wird geladen'))load(true);
  },300000);
 };
 $('closeLiveArchive').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{clearInterval(refreshTimer);revision++;controller?.abort();tip.hidden=true});
 dialog.addEventListener('click',event=>{
  if(event.target!==dialog)return;
  const r=dialog.getBoundingClientRect();
  if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)dialog.close();
 });
 station.onchange=()=>load(true);
 range.onchange=()=>{updateRange();load()};
 mode.onchange=$('archiveResolution').onchange=$('archiveStart').onchange=$('archiveEnd').onchange=()=>load();
 $('archiveRefresh').onclick=()=>load(true);
 window.addEventListener('weather-live-connection-changed',()=>{if(dialog.open)load(true)});
})();
