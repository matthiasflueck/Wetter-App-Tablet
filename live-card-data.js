/* Pure compact-chart preparation, shared by Mac and tablet. */
(function(root){
 const swissDateTime=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
 // Steadman / Bureau of Meteorology: shade, wind at 10 m in m/s.
 function apparentTemperature(temperature,humidity,windKmh){
  if(![temperature,humidity,windKmh].every(Number.isFinite)||temperature<=-100||temperature>=100||humidity<0||humidity>100||windKmh<0)return null;
  const vapour=humidity/100*6.105*Math.exp(17.27*temperature/(237.7+temperature));
  const value=temperature+.33*vapour-.70*(windKmh/3.6)-4;
  return Number.isFinite(value)?value:null;
 }
 function apparentFromSensors(sensors){
  const temperature=sensors.find(s=>s.kind==='thermohygro'),wind=sensors.find(s=>s.kind==='wind');
  if(!temperature||!wind)return null;
  const t=temperature.observation,w=wind.observation;if(!t||!w)return null;
  return apparentTemperature(t.values?.temperature_c,t.values?.humidity_percent,w.values?.wind_kmh);
 }
 const liveFields={thermohygro:['temperature_c','humidity_percent'],wind:['wind_kmh','gust_kmh','wind_direction_degrees'],rain:['rain_total_mm'],solar:['solar_wm2','uv_index'],pressure:['pressure_hpa','pressure_qff_hpa'],lightning:['lightning_count','lightning_distance_km','lightning_event_at']};
 function validLiveValue(key,value){
  if(!Number.isFinite(value))return false;
  if(key==='temperature_c')return value> -100&&value<100;
  if(key==='humidity_percent')return value>=0&&value<=100;
  return value>=0;
 }
 function lastLiveSnapshot(state){
  const station=state?.station||'';
  if(typeof station!=='string'||!/^(?:[a-z]{3})?$/.test(station)||!Array.isArray(state?.sensors))return null;
  const sensors=state.sensors.filter(sensor=>sensor&&Object.hasOwn(liveFields,sensor.kind)&&typeof sensor.key==='string'&&/^[a-zA-Z0-9_-]{1,80}$/.test(sensor.key)&&['meteoswiss','tfa_weatherhub','ecowitt'].includes(sensor.provider)).slice(0,12).map(sensor=>{
   const observation=sensor.observation,values={},times={};
   for(const key of liveFields[sensor.kind])if(validLiveValue(key,observation?.values?.[key])){
    values[key]=observation.values[key];
    const time=observation.value_times?.[key]??observation.measured_at;
    if(Number.isFinite(time))times[key]=time;
   }
   return {key:sensor.key,kind:sensor.kind,provider:sensor.provider,name:typeof sensor.name==='string'?sensor.name.slice(0,160):sensor.kind,
    observation:Object.keys(values).length?{values,value_times:times,measured_at:Number.isFinite(observation.measured_at)?observation.measured_at:0,
     last_seen_at:Number.isFinite(observation.last_seen_at)?observation.last_seen_at:null,battery_low:typeof observation.battery_low==='boolean'?observation.battery_low:null}:null};
  });
  return {station,recording:state.recording===true,observed_end:Number.isFinite(state.observed_end)?state.observed_end:undefined,sensors};
 }
 function retainLastLive(state,previous){
  if(!previous||(state.station||'')!==(previous.station||''))return state;
  const old=new Map((previous.sensors||[]).map(sensor=>[sensor.key,sensor]));
  const sensors=(state.sensors||[]).map(sensor=>{
   const last=old.get(sensor.key);old.delete(sensor.key);
   if(last?.kind!==sensor.kind||last.provider!==sensor.provider||!last.observation)return sensor;
   const observation=sensor.observation;
   if(!observation)return {...sensor,observation:last.observation};
   const values={...observation.values},times={...observation.value_times};
   for(const key of liveFields[sensor.kind]||[]){
    const oldTime=last.observation.value_times?.[key]??last.observation.measured_at;
    const newTime=observation.value_times?.[key]??observation.measured_at;
    if(validLiveValue(key,last.observation.values?.[key])&&(!validLiveValue(key,values[key])||Number.isFinite(oldTime)&&Number.isFinite(newTime)&&oldTime>newTime)){
     values[key]=last.observation.values[key];times[key]=oldTime;
    }
   }
   return {...sensor,observation:{...observation,values,value_times:times}};
  });
  for(const sensor of old.values())if(sensor.observation)sensors.push({...sensor,error:'Keine neuen Werte empfangen. Der letzte Messwert wird angezeigt.'});
  return {...state,sensors};
 }
 function binBars(data,count=48){
  const span=(data.end-data.start)/count,bins=new Map();for(const p of data.points||[]){if(!Number.isFinite(p.value))continue;const t=(p.first+p.last)/2,index=Math.min(count-1,Math.max(0,Math.floor((t-data.start)/span)));let b=bins.get(index);if(!b){b={first:data.start+index*span,last:data.start+(index+1)*span,total:0,count:0,minimum:Infinity,maximum:-Infinity};bins.set(index,b)}const weight=p.count||1;b.total+=p.value*weight;b.count+=weight;b.minimum=Math.min(b.minimum,p.minimum??p.value);b.maximum=Math.max(b.maximum,p.maximum??p.value)}return [...bins.values()].map(b=>({...b,last:Math.min(b.last,data.observed_end??data.end),value:b.total/b.count}));
 }
 function segments(points,gap=900,connectGaps=false){if(connectGaps){const valid=(points||[]).filter(p=>Number.isFinite(p.value));return valid.length?[valid]:[]}const result=[];let group=[],previous=null;for(const p of points||[]){if(!Number.isFinite(p.value)){if(group.length)result.push(group);group=[];previous=null;continue}if(previous!==null&&p.first-previous>gap){if(group.length)result.push(group);group=[]}group.push(p);previous=p.last}if(group.length)result.push(group);return result}
 // Apply a centred, weighted mean within each continuous segment.
 function smoothSegment(points,radius,fields=['value']){
  if(!radius||points.length<3)return points;
  return points.map((point,index)=>{
   const smoothed={...point};
   for(const field of fields){
    let total=0,weight=0;
    for(let i=Math.max(0,index-radius);i<=Math.min(points.length-1,index+radius);i++){
     const factor=radius+1-Math.abs(index-i);
     total+=points[i][field]*factor;
     weight+=factor;
    }
    smoothed[field]=total/weight;
   }
   return smoothed;
  });
 }
 function midnight(now){const parts=t=>Object.fromEntries(swissDateTime.formatToParts(new Date(t*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));const d=parts(now),wall=Date.UTC(d.year,d.month-1,d.day)/1000;let utc=wall;for(let i=0;i<3;i++){const q=parts(utc),local=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)/1000;utc-=local-wall}return utc}
 function rangeWindow(end,selection,mode='rolling'){
  const value=Number(selection),calendar=mode==='calendar'&&[720,8760].includes(value);
  if(value!==8760&&!calendar)return {start:end-value*3600,end,observedEnd:end};
  const parts=t=>Object.fromEntries(swissDateTime.formatToParts(new Date(t*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const utc=wall=>{let t=wall;for(let i=0;i<3;i++){const q=parts(t);t-=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)/1000-wall}return t},d=parts(end);
  if(calendar){const month=value===8760?0:d.month-1,start=utc(Date.UTC(d.year,month,1)/1000),finish=utc(Date.UTC(d.year+(value===8760?1:0),value===8760?0:month+1,1)/1000);return {start,end:finish,observedEnd:end}}
  const year=d.year-1,day=Math.min(d.day,new Date(Date.UTC(year,d.month,0)).getUTCDate()),wall=Date.UTC(year,d.month-1,day,d.hour,d.minute,d.second)/1000;
  return {start:utc(wall)+(end-Math.floor(end)),end,observedEnd:end};
 }
 function aggregateLong(data,selection,maximum=false){
  const seconds=Number(selection)===8760?86400:Number(selection)===720?21600:0;
  if(!seconds)return data;
  const count=Math.max(1,Math.ceil((data.end-data.start)/seconds)),points=binBars(data,count).map(p=>({...p,value:maximum?p.maximum:p.value}));
  return {...data,points,bucket_seconds:(data.end-data.start)/count,display_aggregation:maximum?'maximum':'mean'};
 }
 function timeAxis(start,end,hours){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return {midnights:[],days:[],times:[],groups:[],months:[]};
  const midnights=[],days=[],times=[],groups=[],months=[],long=Number(hours)>=24,monthMode=Number(hours)===720,yearMode=Number(hours)===8760,dateFormat=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit'}),weekdayFormat=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Zurich',weekday:'short'}),monthFormat=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',month:'long'}),monthShort=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',month:'short'}),yearFormat=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric'}),weekdays={Sun:'So',Mon:'Mo',Tue:'Di',Wed:'Mi',Thu:'Do',Fri:'Fr',Sat:'Sa'};
  const monthGroups=new Map(),yearGroups=new Map();let day=midnight(start);
  for(let i=0;i<370&&day<=end;i++){const next=midnight(day+36*3600),first=Math.max(start,day),last=Math.min(end,next);if(day>=start)midnights.push(day);if(long&&last>first){const time=(first+last)/2,date=new Date(time*1000),year=yearFormat.format(date),month=monthFormat.format(date),key=year+'-'+month;days.push({start:first,end:last,time,weekday:weekdays[weekdayFormat.format(date)],date:dateFormat.format(date)});for(const [map,k,label] of [[monthGroups,key,month],[yearGroups,year,year]]){const g=map.get(k);if(g)g.end=last;else map.set(k,{start:first,end:last,label})}}
  if(next<=day)break;day=next}
  if(monthMode)groups.push(...monthGroups.values());if(yearMode){groups.push(...yearGroups.values());for(const g of monthGroups.values())months.push({...g,time:(g.start+g.end)/2,label:monthShort.format(new Date((g.start+g.end)*500))})}
  if(!long)for(let i=0;i<5;i++)times.push(start+(end-start)*i/4);
  return {midnights,days:yearMode?[]:days,times,groups:groups.map(g=>({...g,time:(g.start+g.end)/2})),months,monthMode,yearMode};
 }
 // NOAA solar-position equations, standard apparent horizon (90.833 degrees).
 // https://gml.noaa.gov/grad/solcalc/solareqns.PDF
 function sunTimes(now,latitude=46.8727,longitude=7.5616){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(now*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)])),{year,month,day}=parts,start=Date.UTC(year,month-1,day)/1000,ordinal=Math.floor((start-Date.UTC(year,0,1)/1000)/86400)+1,yearDays=(Date.UTC(year+1,0,1)-Date.UTC(year,0,1))/86400000,rad=Math.PI/180,phi=latitude*rad;
  const event=rise=>{let minutes=rise?360:1080;for(let i=0;i<3;i++){const g=2*Math.PI/yearDays*(ordinal-1+(minutes/60-12)/24),equation=229.18*(.000075+.001868*Math.cos(g)-.032077*Math.sin(g)-.014615*Math.cos(2*g)-.040849*Math.sin(2*g)),declination=.006918-.399912*Math.cos(g)+.070257*Math.sin(g)-.006758*Math.cos(2*g)+.000907*Math.sin(2*g)-.002697*Math.cos(3*g)+.00148*Math.sin(3*g),cosHour=Math.cos(90.833*rad)/(Math.cos(phi)*Math.cos(declination))-Math.tan(phi)*Math.tan(declination);if(cosHour< -1||cosHour>1)return null;const angle=Math.acos(cosHour)/rad;minutes=720-4*(longitude+(rise?angle:-angle))-equation}return start+minutes*60};
  return {day:year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0'),sunrise:event(true),sunset:event(false)};
 }
 function extrema(data){const points=(data.points||[]).filter(p=>Number.isFinite(p.value));return points.length?{min:Math.min(...points.map(p=>p.minimum??p.value)),max:Math.max(...points.map(p=>p.maximum??p.value))}:null}
 function rainTotal(data){return data.aggregation==='rain_increment'&&data.baseline_available&&!data.unknown_intervals?data.points.reduce((sum,p)=>sum+(Number.isFinite(p.value)?p.value:0),0):null}
 function baseline(data,target,tolerance=180){const points=data.points.filter(p=>Number.isFinite(p.value)&&Math.abs((p.first+p.last)/2-target)<=tolerance);return points.length?points.reduce((a,b)=>Math.abs((a.first+a.last)/2-target)<Math.abs((b.first+b.last)/2-target)?a:b).value:null}
  function createRequestQueue(limit=2){
  let active=0;const waiting=[];
  const abort=()=>new DOMException('Abgebrochen','AbortError');
  function pump(){
   while(active<limit&&waiting.length){
    const job=waiting.shift();job.cleanup();
    if(job.signal?.aborted){job.reject(abort());continue}
    active++;
    Promise.resolve().then(job.task).then(job.resolve,job.reject).finally(()=>{active--;pump()});
   }
  }
  return (task,signal)=>new Promise((resolve,reject)=>{
   if(signal?.aborted){reject(abort());return}
   const job={task,signal,resolve,reject,cleanup:()=>signal?.removeEventListener('abort',cancel)};
   function cancel(){const i=waiting.indexOf(job);if(i>=0){waiting.splice(i,1);job.cleanup();reject(abort())}}
   signal?.addEventListener('abort',cancel,{once:true});waiting.push(job);pump();
  });
 }

 function liveVersion(state){
  const entries=value=>Object.entries(value||{}).sort(([a],[b])=>a.localeCompare(b));
  return JSON.stringify([!!state?.recording,state?.error||null,(state?.sensors||[]).map(sensor=>[
   sensor.key,sensor.kind,sensor.provider,sensor.name,sensor.error||null,
   sensor.observation?[sensor.observation.measured_at,entries(sensor.observation.values),entries(sensor.observation.value_times),sensor.observation.battery_low]:null
  ]).sort((a,b)=>a[0].localeCompare(b[0]))]);
 }
 // Hypsometric approximation using a mean column temperature and standard lapse rate.
 function seaLevelPressure(pressure,temperature,elevation){
  if(![pressure,temperature,elevation].every(Number.isFinite)||pressure<=0||temperature<=-100||temperature>=70||elevation< -500||elevation>5000)return null;
  const kelvin=temperature+273.15+.00325*elevation;
  return pressure*Math.exp(9.80665*elevation/(287.05*kelvin));
 }
 const api={seaLevelPressure,liveVersion,createRequestQueue,aggregateLong,rangeWindow,apparentTemperature,apparentFromSensors,lastLiveSnapshot,retainLastLive,binBars,segments,smoothSegment,midnight,timeAxis,sunTimes,extrema,rainTotal,baseline};if(typeof module!=='undefined')module.exports=api;else root.WeatherLiveCardData=api;
})(typeof window==='undefined'?this:window);
/* Touch devices implicitly capture the first cell: inspect the cell under the finger
   instead, so heatmaps and column charts can be scrubbed continuously. */
if(typeof document!=='undefined'){
 const inspectTouch=event=>{if(event.pointerType!=='touch')return;const plot=event.target.closest?.('.live-mini svg,.annual-chart svg,#plot,#archivePlot');if(!plot)return;const hit=document.elementFromPoint(event.clientX,event.clientY);if(!hit||!plot.contains(hit))return;let target=hit;while(target&&target!==plot&&!target.onpointermove)target=target.parentElement;const handler=target?.onpointermove;if(handler&&(event.type==='pointerdown'||!event.target.contains(hit))){handler.call(target,event);if(event.type==='pointermove')event.stopPropagation()}};
 document.addEventListener('pointerdown',inspectTouch,true);document.addEventListener('pointermove',inspectTouch,true);
}
