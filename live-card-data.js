/* Pure compact-chart preparation, shared by Mac and tablet. */
(function(root){
 // Steadman / Bureau of Meteorology: shade, wind at 10 m in m/s.
 function apparentTemperature(temperature,humidity,windKmh){
  if(![temperature,humidity,windKmh].every(Number.isFinite)||temperature<=-100||temperature>=100||humidity<0||humidity>100||windKmh<0)return null;
  const vapour=humidity/100*6.105*Math.exp(17.27*temperature/(237.7+temperature));
  const value=temperature+.33*vapour-.70*(windKmh/3.6)-4;
  return Number.isFinite(value)?value:null;
 }
 function apparentFromSensors(sensors,now){
  const temperature=sensors.find(s=>s.kind==='thermohygro'),wind=sensors.find(s=>s.kind==='wind');
  if(!temperature||!wind||temperature.error||wind.error||!Number.isFinite(now))return null;
  const t=temperature.observation,w=wind.observation;if(!t||!w)return null;
  const times=[t.value_times?.temperature_c??t.measured_at,t.value_times?.humidity_percent??t.measured_at,w.value_times?.wind_kmh??w.measured_at];
  if(times.some(time=>!Number.isFinite(time)||now-time>900||time-now>120)||Math.max(...times)-Math.min(...times)>600)return null;
  return apparentTemperature(t.values?.temperature_c,t.values?.humidity_percent,w.values?.wind_kmh);
 }
 function binBars(data,count=48){
  const span=(data.end-data.start)/count,bins=new Map();for(const p of data.points||[]){if(!Number.isFinite(p.value))continue;const t=(p.first+p.last)/2,index=Math.min(count-1,Math.max(0,Math.floor((t-data.start)/span)));let b=bins.get(index);if(!b){b={first:data.start+index*span,last:data.start+(index+1)*span,total:0,count:0,minimum:Infinity,maximum:-Infinity};bins.set(index,b)}const weight=p.count||1;b.total+=p.value*weight;b.count+=weight;b.minimum=Math.min(b.minimum,p.minimum??p.value);b.maximum=Math.max(b.maximum,p.maximum??p.value)}return [...bins.values()].map(b=>({...b,value:b.total/b.count}));
 }
 function segments(points,gap=900,connectGaps=false){if(connectGaps){const valid=(points||[]).filter(p=>Number.isFinite(p.value));return valid.length?[valid]:[]}const result=[];let group=[],previous=null;for(const p of points||[]){if(!Number.isFinite(p.value)){if(group.length)result.push(group);group=[];previous=null;continue}if(previous!==null&&p.first-previous>gap){if(group.length)result.push(group);group=[]}group.push(p);previous=p.last}if(group.length)result.push(group);return result}
 function midnight(now){const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));const d=parts(now),wall=Date.UTC(d.year,d.month-1,d.day)/1000;let utc=wall;for(let i=0;i<3;i++){const q=parts(utc),local=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)/1000;utc-=local-wall}return utc}
 function rangeWindow(end,selection){
  if(Number(selection)!==8760)return {start:end-Number(selection)*3600,end};
  const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
  const d=parts(end),year=d.year-1,day=Math.min(d.day,new Date(Date.UTC(year,d.month,0)).getUTCDate()),wall=Date.UTC(year,d.month-1,day,d.hour,d.minute,d.second)/1000;let utc=wall;
  for(let i=0;i<3;i++){const q=parts(utc);utc-=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)/1000-wall}
  return {start:utc+(end-Math.floor(end)),end};
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
 const api={rangeWindow,apparentTemperature,apparentFromSensors,binBars,segments,midnight,timeAxis,sunTimes,extrema,rainTotal,baseline};if(typeof module!=='undefined')module.exports=api;else root.WeatherLiveCardData=api;
})(typeof window==='undefined'?this:window);
/* Touch devices implicitly capture the first cell: inspect the cell under the finger
   instead, so heatmaps and column charts can be scrubbed continuously. */
if(typeof document!=='undefined'){
 const inspectTouch=event=>{if(event.pointerType!=='touch')return;const plot=event.target.closest?.('.live-mini svg,.annual-chart svg,#plot,#archivePlot');if(!plot)return;const hit=document.elementFromPoint(event.clientX,event.clientY);if(!hit||!plot.contains(hit))return;let target=hit;while(target&&target!==plot&&!target.onpointermove)target=target.parentElement;const handler=target?.onpointermove;if(handler&&(event.type==='pointerdown'||!event.target.contains(hit))){handler.call(target,event);if(event.type==='pointermove')event.stopPropagation()}};
 document.addEventListener('pointerdown',inspectTouch,true);document.addEventListener('pointermove',inspectTouch,true);
}
