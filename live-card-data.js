/* Pure compact-chart preparation, shared by Mac and tablet. */
(function(root){
 function binBars(data,count=48){
  const span=(data.end-data.start)/count,bins=new Map();for(const p of data.points||[]){if(!Number.isFinite(p.value))continue;const t=(p.first+p.last)/2,index=Math.min(count-1,Math.max(0,Math.floor((t-data.start)/span)));let b=bins.get(index);if(!b){b={first:data.start+index*span,last:data.start+(index+1)*span,total:0,count:0,minimum:Infinity,maximum:-Infinity};bins.set(index,b)}const weight=p.count||1;b.total+=p.value*weight;b.count+=weight;b.minimum=Math.min(b.minimum,p.minimum??p.value);b.maximum=Math.max(b.maximum,p.maximum??p.value)}return [...bins.values()].map(b=>({...b,value:b.total/b.count}));
 }
 function segments(points,gap=900,connectGaps=false){if(connectGaps){const valid=(points||[]).filter(p=>Number.isFinite(p.value));return valid.length?[valid]:[]}const result=[];let group=[],previous=null;for(const p of points||[]){if(!Number.isFinite(p.value)){if(group.length)result.push(group);group=[];previous=null;continue}if(previous!==null&&p.first-previous>gap){if(group.length)result.push(group);group=[]}group.push(p);previous=p.last}if(group.length)result.push(group);return result}
 function midnight(now){const parts=t=>Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(t*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));const d=parts(now),wall=Date.UTC(d.year,d.month-1,d.day)/1000;let utc=wall;for(let i=0;i<3;i++){const q=parts(utc),local=Date.UTC(q.year,q.month-1,q.day,q.hour,q.minute,q.second)/1000;utc-=local-wall}return utc}
 function timeAxis(start,end,hours){
  if(!Number.isFinite(start)||!Number.isFinite(end)||start>=end)return {midnights:[],days:[],times:[]};
  const midnights=[],days=[],times=[],long=Number(hours)>=24,dateFormat=new Intl.DateTimeFormat('de-CH',{timeZone:'Europe/Zurich',day:'2-digit',month:'2-digit'}),weekdayFormat=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Zurich',weekday:'short'}),weekdays={Sun:'So',Mon:'Mo',Tue:'Di',Wed:'Mi',Thu:'Do',Fri:'Fr',Sat:'Sa'};
  let day=midnight(start);for(let i=0;i<370&&day<=end;i++){const next=midnight(day+36*3600);if(day>=start)midnights.push(day);const first=Math.max(start,day),last=Math.min(end,next);if(long&&last>first){const time=(first+last)/2;days.push({start:first,end:last,time,weekday:weekdays[weekdayFormat.format(new Date(time*1000))],date:dateFormat.format(new Date(time*1000))})}if(next<=day)break;day=next}
  if(!long)for(let i=0;i<5;i++)times.push(start+(end-start)*i/4);
  return {midnights,days,times};
 }
 function extrema(data){const points=(data.points||[]).filter(p=>Number.isFinite(p.value));return points.length?{min:Math.min(...points.map(p=>p.minimum??p.value)),max:Math.max(...points.map(p=>p.maximum??p.value))}:null}
 function rainTotal(data){return data.aggregation==='rain_increment'&&data.baseline_available&&!data.unknown_intervals?data.points.reduce((sum,p)=>sum+(Number.isFinite(p.value)?p.value:0),0):null}
 function baseline(data,target,tolerance=180){const points=data.points.filter(p=>Number.isFinite(p.value)&&Math.abs((p.first+p.last)/2-target)<=tolerance);return points.length?points.reduce((a,b)=>Math.abs((a.first+a.last)/2-target)<Math.abs((b.first+b.last)/2-target)?a:b).value:null}
 const api={binBars,segments,midnight,timeAxis,extrema,rainTotal,baseline};if(typeof module!=='undefined')module.exports=api;else root.WeatherLiveCardData=api;
})(typeof window==='undefined'?this:window);
/* Touch devices implicitly capture the first cell: inspect the cell under the finger
   instead, so heatmaps and column charts can be scrubbed continuously. */
if(typeof document!=='undefined'){
 const inspectTouch=event=>{if(event.pointerType!=='touch')return;const plot=event.target.closest?.('.live-mini svg,.annual-chart svg,#plot,#archivePlot');if(!plot)return;const hit=document.elementFromPoint(event.clientX,event.clientY);if(!hit||!plot.contains(hit))return;let target=hit;while(target&&target!==plot&&!target.onpointermove)target=target.parentElement;const handler=target?.onpointermove;if(handler&&(event.type==='pointerdown'||!event.target.contains(hit))){handler.call(target,event);if(event.type==='pointermove')event.stopPropagation()}};
 document.addEventListener('pointerdown',inspectTouch,true);document.addEventListener('pointermove',inspectTouch,true);
}
