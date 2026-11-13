/* Shared preferences are a separate, append-only revision history in Drive. */
(function(root){
 'use strict';
 const STATE='wetter.preferenceSync',ROLE='preferences-v1',BASE='https://www.googleapis.com';
 const schema=new Map();
 const add=(path,label,valid)=>schema.set(path,{label,valid});
 const oneOf=(...values)=>value=>values.includes(value);
 const text=max=>value=>typeof value==='string'&&value.length<=max;
 const finite=(min,max)=>value=>Number.isFinite(value)&&value>=min&&value<=max;
 const bool=value=>typeof value==='boolean';
 const color=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
 const array=(valid,max=100)=>value=>Array.isArray(value)&&value.length<=max&&value.every(valid)&&new Set(value).size===value.length;
 const pair=value=>Array.isArray(value)&&value.length===2&&value.every(Number.isFinite)&&value[0]<value[1];
 const id=value=>typeof value==='string'&&/^[\w-]{1,120}$/.test(value);
 const panelNames={temperature:'Temperatur',rain:'Niederschlag',solar:'Solarstrahlung',wind:'Wind',humidity:'Luftfeuchte',uv:'UV-Index'};
 const names={...panelNames,pressure:'Luftdruck',pressure_sea:'Luftdruck auf Meereshöhe',gust:'Böe',dewpoint:'Taupunkt'};
 const panels=Object.keys(panelNames).filter(k=>k!=='uv');
 add('preferences.theme','Farbschema',oneOf('dark','light'));
 add('preferences.headerSubtitle','App-Untertitel',text(120));
 add('preferences.legendPosition','Position der Legende',oneOf('top','right'));
 add('preferences.diagramBackgroundEnabled','Diagrammhintergrund anzeigen',bool);
 add('preferences.diagramBackgroundColor','Farbe des Diagrammhintergrunds',v=>v===''||color(v));
 add('preferences.liveHistoryBackgroundEnabled','Live Verlauf · Hintergrund anzeigen',bool);
 add('preferences.liveHistoryBackgroundColor','Live Verlauf · Hintergrundfarbe',v=>v===''||color(v));
 add('preferences.liveHistoryStripes','Live Verlauf · Zeitintervalle schattieren',bool);
 add('thunder.count','Gewitterschwelle · Anzahl',v=>Number.isSafeInteger(v)&&v>=0);
 add('thunder.distance','Gewitterschwelle · Entfernung',finite(0,100000));
 add('timelineValues','Werte im Zeitverlauf anzeigen',bool);
 add('timelineFog','Hochnebel im Zeitverlauf anzeigen',bool);
 add('chartOrder','Diagrammreihenfolge',v=>array(oneOf(...panels),5)(v)&&v.length===5);
 add('temperatureNormals','Temperatur-Referenzen',array(text(120)));
 add('annualNorm','Referenz der Jahresansicht',text(120));
 add('comparisonNorm','Referenz des Jahresvergleichs',text(120));
 for(const [key,label] of Object.entries(panelNames))add('yAxes.'+key,'Y-Achse · '+label,v=>v&&Object.keys(v).length===2&&pair([v.min,v.max]));
 add('liveDisplay.order','Reihenfolge der Live-Kacheln',array(id));
 for(const [key,label] of Object.entries({thermohygro:'Temperatur',rain:'Niederschlag',wind:'Wind',pressure:'Luftdruck',solar:'Solarstrahlung',lightning:'Gewitter'}))
  add('liveDisplay.colors.'+key,'Kachelfarbe · '+label,color);
 add('liveScales.customCharts','Live-Diagrammskalen · Eigene',bool);
 add('liveScales.customGauges','Instrumentenskalen · Eigene',bool);
 add('liveScales.stationHeight','Sensorhöhe',finite(-500,5000));
 for(const [key,label] of Object.entries({thermometer:'Thermometer',thermohygro:'Temperaturdiagramm',rain:'Regendiagramm',rainTank:'Regenbehälter',wind:'Winddiagramm',pressure:'Druckdiagramm',barometer:'Barometer',barometerZones:'Barometer-Druckzonen',solar:'Solardiagramm',solarMeter:'Solarsäule',lightning:'Blitzdiagramm',distance:'Blitzentfernung'}))
  add('liveScales.bounds.'+key,'Skala · '+label,v=>pair(v)&&(key==='thermometer'?v[0]<0&&v[1]>0:['thermohygro','pressure'].includes(key)||v[0]>=0));
 add('liveScales.pressureColors.low','Farbe für Tiefdruck',color);
 add('liveScales.pressureColors.high','Farbe für Hochdruck',color);
 for(const [key,label] of Object.entries({temperature_c:'Temperatur',humidity_percent:'Luftfeuchte',rain_total_mm:'Niederschlag',wind_kmh:'Wind',gust_kmh:'Böe',wind_direction_degrees:'Windrichtung',pressure_hpa:'Stationsdruck',solar_wm2:'Solarstrahlung',uv_index:'UV-Index',lightning_count:'Blitze',lightning_distance_km:'Blitzentfernung'}))
  add('liveDetailColors.'+key,'Verlaufsfarbe · '+label,color);
 add('analysisMetrics','Messgrössen der Analyse',array(oneOf(...Object.keys(names))));
 add('analysisDisplay.rightAxes','Rechte Analyseachsen anzeigen',bool);
 for(const [key,label] of Object.entries(names))add('analysisDisplay.colors.'+key,'Analysefarbe · '+label,color);
 add('measurementExport.columns','Spalten des Messdatenexports',array(id));
 const layout=typeof module!=='undefined'?require('./live-layout.js'):root.WeatherLiveLayout;
 add('liveViews','Gespeicherte Live-Ansichten',value=>layout?.validViews(value));
 const rawKeys=new Set(['annualNorm','comparisonNorm']);
 const own=(obj,key)=>Object.prototype.hasOwnProperty.call(obj,key);
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const parse=(storage,key,fallback)=>{try{return JSON.parse(storage.getItem(key))??fallback}catch(error){return fallback}};
 const valid=(key,value)=>schema.has(key)&&(value===null||schema.get(key).valid(value));
 function equal(a,b){
  if((a??null)===(b??null))return true;
  if(Array.isArray(a)&&Array.isArray(b))return a.length===b.length&&a.every((v,i)=>equal(v,b[i]));
  return record(a)&&record(b)&&Object.keys(a).length===Object.keys(b).length&&Object.keys(a).every(key=>own(b,key)&&equal(a[key],b[key]));
 }
 const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);

 function readLocal(storage){
  const result={},roots=new Map();
  for(const [key] of schema){
   const [group,...path]=key.split('.');
   if(!roots.has(group))roots.set(group,rawKeys.has(group)?storage.getItem('wetter.'+group):parse(storage,'wetter.'+group,null));
   const value=roots.get(group);
   let current=path.reduce((obj,part)=>obj?.[part],value);
   if(group==='liveScales'){
    if(['customCharts','customGauges'].includes(path[0]))current??=value?.custom;
    // Old barometer bounds described station pressure, not sea-level pressure.
    if(path.join('.')==='bounds.barometer'&&value?.barometerBasis!=='sea-level')continue;
   }
   if(current!==null&&valid(key,current))result[key]=current;
  }
  return result;
 }
 function applyLocal(storage,patch){
  const roots=new Map();
  for(const [key,value] of Object.entries(patch)){
   const [group,...path]=key.split('.');
   if(!path.length){
    const name='wetter.'+group;
    if(value===null)storage.removeItem(name);
    else storage.setItem(name,rawKeys.has(group)?value:JSON.stringify(value));
    continue;
   }
   if(!roots.has(group)){
    const previous=parse(storage,'wetter.'+group,{});
    roots.set(group,record(previous)?previous:{});
   }
   const parent=path.slice(0,-1).reduce((obj,part)=>{
    if(!record(obj[part]))obj[part]={};
    return obj[part];
   },roots.get(group));
   if(value===null)delete parent[path.at(-1)];else parent[path.at(-1)]=value;
   if(key==='liveScales.bounds.barometer'&&value!==null)roots.get(group).barometerBasis='sea-level';
   if(group==='liveScales'&&['customCharts','customGauges'].includes(path[0])){
    const settings=roots.get(group);
    for(const mode of ['customCharts','customGauges'])if(mode!==path[0]&&settings[mode]===undefined&&typeof settings.custom==='boolean')settings[mode]=settings.custom;
    delete settings.custom;
   }
  }
  for(const [group,value] of roots)storage.setItem('wetter.'+group,JSON.stringify(value));
 }
 function validateEvent(event){
  if(!record(event)||event.version!==1||!uuid(event.id)||!record(event.changes)||!Object.keys(event.changes).length||Object.keys(event.changes).length>schema.size)throw Error('Ungültige Einstellungsrevision.');
  for(const [key,change] of Object.entries(event.changes)){
   if(!record(change)||!own(change,'value')||!valid(key,change.value)||!array(uuid,500)(change.parents)||change.parents.includes(event.id))throw Error('Ungültige synchronisierte Einstellung.');
  }
  return event;
 }
 function headsFor(events){
  const all=new Map(),removed=new Map();
  for(const event of new Map(events.map(e=>[e.id,e])).values()){
   for(const [key,change] of Object.entries(event.changes)){
    if(!all.has(key)){all.set(key,[]);removed.set(key,new Set())}
    all.get(key).push({id:event.id,value:change.value});
    for(const parent of change.parents)removed.get(key).add(parent);
   }
  }
  for(const [key,heads] of all)all.set(key,heads.filter(head=>!removed.get(key).has(head.id)));
  return all;
 }
 function plan(local,base,events){
  const heads=headsFor(events),changes={},merged={},conflicts=[];
  for(const key of schema.keys()){
   const entries=heads.get(key)||[],values=[];
   for(const entry of entries)if(!values.some(value=>equal(value,entry.value)))values.push(entry.value);
   const hasLocal=own(local,key),hasBase=own(base,key),value=local[key]??null;
   const changed=hasBase?!equal(value,base[key]):hasLocal;
   const parents=entries.map(e=>e.id),remote=values[0];
   if(!values.length){
    if(hasLocal){merged[key]=value;changes[key]={value,parents}}
   }else if(values.length>1||(changed&&!equal(value,remote)&&(!hasBase||!equal(base[key],remote)))){
    conflicts.push({key,parents,options:[...(hasLocal||hasBase?[{label:'Dieses Gerät',value}]:[]),
     ...values.filter(v=>!(hasLocal||hasBase)||!equal(v,value)).map((v,i)=>({label:'Google Drive'+(values.length>1?' '+(i+1):''),value:v}))]});
   }else if(changed&&!equal(value,remote)){
    merged[key]=value;changes[key]={value,parents};
   }else merged[key]=remote;
  }
  return {changes,merged,conflicts};
 }

 function driveTransport(fetchAuthorized){
  return async (action,payload={})=>{
   if(action==='list'){
    const about=await (await fetchAuthorized(BASE+'/drive/v3/about?fields=user(permissionId)')).json();
    const files=[];
    let pageToken;
    do{
     const query=new URLSearchParams({spaces:'appDataFolder',q:"trashed = false and appProperties has { key='wetterRole' and value='"+ROLE+"' }",fields:'nextPageToken,files(id)',pageSize:'1000'});
     if(pageToken)query.set('pageToken',pageToken);
     const page=await (await fetchAuthorized(BASE+'/drive/v3/files?'+query)).json();
     files.push(...page.files||[]);pageToken=page.nextPageToken;
    }while(pageToken);
    return {account:about.user?.permissionId,files:files.map(f=>f.id)};
   }
   if(action==='read')return (await fetchAuthorized(BASE+'/drive/v3/files/'+encodeURIComponent(payload.id)+'?alt=media')).json();
   const event=payload.event,boundary='wetter_'+event.id;
   const metadata={name:'wetter-einstellungen-'+event.id+'.json',parents:['appDataFolder'],appProperties:{wetterRole:ROLE}};
   const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+
    '\r\n--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(event)+'\r\n--'+boundary+'--\r\n';
   return (await fetchAuthorized(BASE+'/upload/drive/v3/files?uploadType=multipart&fields=id',{
    method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
   })).json();
  };
 }
 async function synchronize(storage,transport,resolve,makeId){
  const previous=parse(storage,STATE,{});
  const {account,files}=await transport('list');
  if(typeof account!=='string'||!account||!Array.isArray(files)||!files.every(id))throw Error('Google-Konto oder Dateiliste konnte nicht geprüft werden.');
  const same=previous.account===account,cache=same&&record(previous.cache)?previous.cache:{};
  const events=[],nextCache=Object.create(null);
  for(let i=0;i<files.length;i+=6){
   const batch=await Promise.all(files.slice(i,i+6).map(async file=>[file,validateEvent(own(cache,file)?cache[file]:await transport('read',{id:file}))]));
   for(const [file,event] of batch){events.push(event);nextCache[file]=event}
  }
  const local=readLocal(storage),base=same&&record(previous.values)?previous.values:{};
  const result=plan(local,base,events);
  if(result.conflicts.length){
   const choices=await resolve(result.conflicts);
   if(!choices)return {cancelled:true};
   if(!equal(readLocal(storage),local))throw Error('Einstellungen wurden während des Abgleichs geändert. Bitte erneut synchronisieren.');
   for(const {key,parents,options} of result.conflicts){
    const choice=options[choices[key]];
    if(!choice)throw Error('Bitte alle Konflikte auflösen.');
    result.merged[key]=choice.value;result.changes[key]={value:choice.value,parents};
   }
  }
  if(Object.keys(result.changes).length){
   const event=validateEvent({version:1,id:makeId(),changes:result.changes});
   const uploaded=await transport('append',{event});
   if(!id(uploaded?.id))throw Error('Google hat die Einstellungsspeicherung nicht bestätigt.');
   nextCache[uploaded.id]=event;
  }
  const current=readLocal(storage),patch={};
  for(const [key,value] of Object.entries(result.merged)){
   if(equal(local[key],current[key])&&!equal(value,current[key]))patch[key]=value;
  }
  applyLocal(storage,patch);
  const state={account,values:result.merged,cache:nextCache};
  if(JSON.stringify(state).length>400000)state.cache={};
  storage.setItem(STATE,JSON.stringify(state));
  return {changed:Object.keys(patch).length,published:Object.keys(result.changes).length};
 }

 function conflictPreview(key,options){
  const metricNames=Object.fromEntries((layout?.definitions||[]).map(d=>[d.key,d.label]));
  const plain=value=>value===null||value===undefined?'Standardwert':typeof value==='boolean'?value?'Ein':'Aus':Array.isArray(value)?value.map(plain).join(' – '):record(value)?Object.entries(value).map(([k,v])=>(metricNames[k]||names[k]||({min:'Min',max:'Max',temperature:'Temperatur',rain:'Niederschlag',wind:'Wind',solar:'Solarstrahlung',humidity:'Luftfeuchte'})[k]||k)+': '+plain(v)).join(' · '):({dark:'Dunkel',light:'Hell',top:'Oberhalb',right:'Rechts'})[value]||String(value)||'Leer';
  if(key!=='liveViews')return {common:[],choices:options.map(option=>({label:option.label,items:[{name:plain(option.value),details:[]}]}))};
  const ids=[...new Set(options.flatMap(option=>Object.keys(option.value||{})))];
  const changed=ids.filter(id=>options.some(option=>!equal(option.value?.[id],options[0].value?.[id])));
  const common=ids.filter(id=>!changed.includes(id)).map(id=>options[0].value[id].name);
  const fields=['station','range','mode','resolution','start','end','assignments','colors','bounds','heights','storm'];
  const labels={station:'Station',range:'Zeitraum',mode:'Zeitraumart',resolution:'Auflösung',start:'Gespeicherter Beginn',end:'Gespeichertes Ende',assignments:'Messgrössen',colors:'Linienfarben',bounds:'Skalen',heights:'Diagrammhöhen',storm:'Gewitterband'};
  const terms={range:{'1':'1 Stunde','2':'2 Stunden','6':'6 Stunden','24':'24 Stunden','168':'7 Tage','720':'Monat','8760':'Jahr',custom:'Freier Zeitraum'},mode:{calendar:'Kalender',rolling:'Gleitend'},resolution:{auto:'Automatisch',raw:'Einzelwerte',day:'Tageswerte',month:'Monatswerte'}};
  const describe=(field,value)=>{
   if(field==='station')return value?value.toUpperCase():'Eigene Wetterstation';
   if(terms[field])return terms[field][value]||plain(value);
   if(field==='assignments')return ['A','B','C'].map(area=>{const metrics=Object.entries(value||{}).filter(([,v])=>v===area).map(([k])=>metricNames[k]||k);return metrics.length?area+': '+metrics.join(', '):''}).filter(Boolean).join(' · ')||'Keine';
   if(field==='heights')return 'A/B '+Math.round(value.upper*100)+' % · C '+Math.round(value.lower*100)+' % · B-Anteil '+Math.round(value.b*100)+' %';
   if(['colors','bounds'].includes(field)&&!Object.keys(value||{}).length)return 'Automatisch / Standard';
   if(['start','end'].includes(field))return value?value.slice(8,10)+'.'+value.slice(5,7)+'.'+value.slice(0,4)+' '+value.slice(11):'Nicht festgelegt';
   return plain(value);
  };
  const choices=options.map(option=>({label:option.label,items:changed.map(id=>{
   const view=option.value?.[id],other=options.find(o=>o.value?.[id])?.value[id];
   if(!view)return {name:other?.name||'Ansicht',details:['In dieser Version nicht vorhanden.']};
   const different=fields.filter(field=>options.some(o=>!equal(o.value?.[id]?.config?.[field],view.config[field])));
   return {name:view.name,details:different.map(field=>labels[field]+': '+describe(field,view.config[field]))};
  })}));
  return {common,choices};
 }
 function resolveConflicts(conflicts){
  const dialog=document.getElementById('preferenceConflicts'),form=dialog.querySelector('form'),fields=dialog.querySelector('[data-conflicts]');
  fields.replaceChildren();
  for(const [index,{key,options}] of conflicts.entries()){
   const group=document.createElement('fieldset'),title=document.createElement('legend');
   title.textContent=schema.get(key).label;group.append(title);
   const preview=conflictPreview(key,options);
   if(key==='liveViews'){
    const note=document.createElement('p');note.className='preference-conflict-note';note.textContent='Nur Unterschiede werden angezeigt. Die gewählte Version der Ansichtensammlung wird auf beide Geräte übernommen.';group.append(note);
    if(preview.common.length){const common=document.createElement('p');common.className='preference-conflict-note';common.textContent='Unverändert auf beiden Seiten: '+preview.common.join(', ');group.append(common)}
   }
   for(const [i,option] of options.entries()){
    const label=document.createElement('label'),input=document.createElement('input');
    Object.assign(input,{type:'radio',name:'conflict-'+index,value:String(i),required:true});
    const content=document.createElement('div'),heading=document.createElement('strong');
    heading.textContent=option.label;content.append(heading);
    for(const item of preview.choices[i].items){
     const entry=document.createElement('div');entry.className='preference-choice-entry';
     const name=document.createElement('b');name.textContent=item.name;entry.append(name);
     for(const detail of item.details){const line=document.createElement('small');line.textContent=detail;entry.append(line)}
     content.append(entry);
    }
    label.append(input,content);
    group.append(label);
   }
   fields.append(group);
  }
  return new Promise(resolve=>{
   let chosen=null;
   form.onsubmit=event=>{
    event.preventDefault();
    const values=new FormData(form);
    chosen=Object.fromEntries(conflicts.map(({key},i)=>[key,Number(values.get('conflict-'+i))]));
    dialog.close();
   };
   dialog.querySelector('[data-cancel]').onclick=()=>dialog.close();
   dialog.addEventListener('close',()=>resolve(chosen),{once:true});
   dialog.showModal();
  });
 }
 function attach({button,status,authorize,syncData}){
  const dialog=document.getElementById('syncSelection'),form=dialog.querySelector('form');
  const preferenceInput=form.elements.namedItem('preferences'),dataInput=form.elements.namedItem('data');
  const submit=form.querySelector('[type=submit]');
  const selectionKey='wetter.syncSelection',noticeKey='wetter.syncNotice';
  const notice=sessionStorage.getItem(noticeKey);
  if(notice){status.textContent=notice;sessionStorage.removeItem(noticeKey)}
  button.disabled=false;
  button.onclick=()=>{
   const saved=parse(localStorage,selectionKey,{});
   preferenceInput.checked=saved.preferences!==false;
   dataInput.checked=saved.data===true;
   form.onchange();
   dialog.showModal();
  };
  form.onchange=()=>{submit.disabled=!preferenceInput.checked&&!dataInput.checked};
  form.querySelector('[data-cancel]').onclick=()=>dialog.close();
  form.onsubmit=async event=>{
   event.preventDefault();
   const selection={preferences:preferenceInput.checked,data:dataInput.checked};
   if(!selection.preferences&&!selection.data)return;
   localStorage.setItem(selectionKey,JSON.stringify(selection));
   dialog.close();
   button.disabled=true;
   status.textContent='Verbindung mit Google wird geprüft …';
   const results=[];
   let reload=false;
   const show=text=>{status.textContent=[...results,text].filter(Boolean).join(' · ')};
   try{
    const transport=await authorize();
    if(selection.preferences){
     show('App-Einstellungen werden abgeglichen …');
     try{
      const run=()=>synchronize(localStorage,transport,resolveConflicts,()=>crypto.randomUUID());
      const result=navigator.locks?await navigator.locks.request('wetter-preference-sync',run):await run();
      reload=!!result.changed;
      results.push(result.cancelled?'App-Einstellungen abgebrochen.':result.changed||result.published?'App-Einstellungen synchronisiert.':'App-Einstellungen sind aktuell.');
     }catch(error){results.push('App-Einstellungen fehlgeschlagen. '+error.message)}
    }
    if(selection.data){
     try{
      const result=await syncData(show);
      reload||=!!result.reload;
      results.push(result.message);
     }catch(error){results.push('Stations- und Referenzdaten fehlgeschlagen. '+error.message)}
    }
   }catch(error){results.push(error.message)}
   finally{
    show('');
    button.disabled=false;
    if(reload){sessionStorage.setItem(noticeKey,status.textContent);location.reload()}
   }
  };
 }
 function macTransport(token){
  return async(action,payload={})=>{
   const response=await fetch('/api/google/preferences',{
    method:'POST',headers:{'Content-Type':'application/json','X-Wetter-Token':token},
    body:JSON.stringify({action,...payload})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(result.message||'Google-Einstellungen sind gerade nicht erreichbar.');
   return result;
  };
 }
 const api={driveTransport,macTransport,synchronize,validateEvent,plan,readLocal,applyLocal,attach,conflictPreview};
 if(typeof module!=='undefined')module.exports=api;
 else root.WeatherPreferenceSync=api;
})(typeof window==='undefined'?this:window);
