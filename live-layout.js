/* Versioned, portable live chart layouts. No measurements or credentials. */
(function(root){
 'use strict';
 const definitions=[
  ['temperature_c','Temperatur','°C','line','#e39062','temperature'],
  ['humidity_percent','Luftfeuchte','%','line','#55bca9','humidity'],
  ['rain_total_mm','Niederschlag','mm','bar','#4f9dcc','rain'],
  ['wind_kmh','Wind Mittel','km/h','line','#42bca0','wind'],
  ['gust_kmh','Böe','km/h','line','#e2aa55','wind'],
  ['wind_direction_degrees','Windrichtung','°','point','#a0b778','direction'],
  ['pressure_hpa','Stationsdruck','hPa','line','#a797d4','pressure'],
  ['solar_wm2','Solarstrahlung','W/m²','bar','#e1b147','solar'],
  ['uv_index','UV-Index','','line','#c78cd0','uv'],
 ].map(([key,label,unit,type,color,axis])=>({key,label,unit,type,color,axis}));
 const areas=['A','B','C'],ranges=['1','2','6','24','168','720','8760','custom'];
 const resolutions=['auto','raw','day','month'];
 const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
 const pair=value=>Array.isArray(value)&&value.length===2&&value.every(n=>Number.isFinite(n)&&Math.abs(n)<=1e9)&&value[0]<value[1];
 const validColor=value=>typeof value==='string'&&/^#[a-f\d]{6}$/i.test(value);
 const metrics=new Set(definitions.map(d=>d.key)),axisIds=new Set(definitions.map(d=>d.axis));
 const date=value=>typeof value==='string'&&(value===''||/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)&&Number.isFinite(Date.parse(value+'Z'))&&new Date(value+'Z').toISOString().slice(0,16)===value);
 function valid(config){
  return record(config)&&Object.keys(config).length===12&&Object.keys(config).every(key=>['version','station','range','mode','resolution','start','end','storm','assignments','colors','bounds','heights'].includes(key))&&config.version===1&&typeof config.station==='string'&&/^(?:[a-z]{3})?$/.test(config.station)&&
   ranges.includes(config.range)&&['rolling','calendar'].includes(config.mode)&&resolutions.includes(config.resolution)&&
   date(config.start)&&date(config.end)&&(config.range!=='custom'||config.start&&config.end&&config.start<config.end)&&
   typeof config.storm==='boolean'&&record(config.assignments)&&Object.entries(config.assignments).every(([key,area])=>metrics.has(key)&&areas.includes(area))&&
   record(config.colors)&&Object.entries(config.colors).every(([key,value])=>metrics.has(key)&&validColor(value))&&
   record(config.bounds)&&Object.entries(config.bounds).every(([area,bounds])=>areas.includes(area)&&record(bounds)&&Object.entries(bounds).every(([axis,value])=>axisIds.has(axis)&&pair(value)))&&
   record(config.heights)&&Object.keys(config.heights).length===3&&['upper','lower','b'].every(key=>Number.isFinite(config.heights[key]))&&
   config.heights.upper>=.2&&config.heights.upper<=1.5&&config.heights.lower>=.12&&config.heights.lower<=1.5&&config.heights.b>=.1&&config.heights.b<=.5;
 }
 function validViews(views){
  return record(views)&&Object.keys(views).length<=30&&Object.entries(views).every(([id,view])=>
   /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(id)&&record(view)&&
   Object.keys(view).length===2&&typeof view.name==='string'&&view.name.trim().length>0&&view.name.length<=80&&valid(view.config));
 }
 function defaults(){
  return {version:1,station:'',range:'24',mode:'rolling',resolution:'auto',start:'',end:'',storm:true,
   assignments:{temperature_c:'A',rain_total_mm:'B',wind_kmh:'C',gust_kmh:'C'},
   colors:{},bounds:{},heights:{upper:.68,lower:.32,b:.2}};
 }
 function axesFor(series,bounds={}){
  const axes=new Map();
  for(const spec of series){
   if(!axes.has(spec.axis))axes.set(spec.axis,{key:spec.axis,unit:spec.unit||'UV',series:[],min:Infinity,max:-Infinity,zero:false});
   const axis=axes.get(spec.axis);
   axis.series.push(spec);axis.zero||=spec.type!=='line'||['wind','uv','humidity'].includes(spec.axis);
   for(const point of spec.data.points){
    const envelope=spec.key==='temperature_c';
    axis.min=Math.min(axis.min,envelope?point.minimum??point.value:point.value);
    axis.max=Math.max(axis.max,envelope?point.maximum??point.value:point.value);
   }
  }
  for(const axis of axes.values()){
   const pad=Math.max((axis.max-axis.min)*.08,.5);
   axis.min=axis.zero?0:axis.min-pad;
   axis.max=Math.max(axis.min+1,axis.max+pad);
   if(axis.key==='direction'){axis.min=0;axis.max=360}
   if(pair(bounds[axis.key]))[axis.min,axis.max]=bounds[axis.key];
  }
  return [...axes.values()];
 }
 function geometry(width,height,heights,axisCounts,storm,columns){
  const rightCount=Math.max(0,...axisCounts.map(count=>count-1));
  const gutter=44;
  const left=columns?.left||gutter,rightWidths=columns?.right||Array(rightCount).fill(gutter);
  const right=Math.max(left+100,width-8-rightWidths.reduce((sum,value)=>sum+value,0));
  const axisX=[left-6,...rightWidths.map((value,index)=>right+5+rightWidths.slice(0,index).reduce((sum,w)=>sum+w,0))];
  const top=typeof storm==='number'&&storm>0?storm:storm?38:14,axisHeight=60,gap=14;
  const budget=Math.max(230,height-top-axisHeight-gap);
  const upper=Math.max(190,budget*heights.upper),lower=Math.max(85,budget*heights.lower);
  const split=top+upper-Math.max(62,upper*heights.b),separator=top+upper+gap/2;
  const cTop=top+upper+gap,cBottom=cTop+lower;
  return {left,right,axisX,top,separator,bottom:cBottom,height:cBottom+axisHeight,
   areas:{A:{top,bottom:split},B:{top:split,bottom:top+upper},C:{top:cTop,bottom:cBottom}}};
 }
 function shifted(window,fraction){
  const delta=(window.end-window.start)*fraction;
  return {start:window.start+delta,end:window.end+delta};
 }
 const directions=['N','NNO','NO','ONO','O','OSO','SO','SSO','S','SSW','SW','WSW','W','WNW','NW','NNW'];
 const compass=value=>directions[((Math.round(value/22.5)%16)+16)%16];
 function directionTicks(min,max,height){
  const step=height>=210?22.5:height>=110?45:90,result=[];
  for(let value=Math.ceil(min/step)*step;value<=max;value+=step)result.push({value,label:compass(value)});
  return result;
 }
 function axisColumns(areaAxes){
  const widths=[];
  for(const axes of areaAxes)axes.forEach((axis,index)=>{
   const labels=axis.key==='direction'?['Richt.','NNW']:[axis.unit,...[axis.min,axis.max].map(value=>value.toLocaleString('de-CH',{maximumFractionDigits:1}))];
   widths[index]=Math.max(widths[index]||0,Math.min(90,Math.max(34,Math.max(...labels.map(label=>label.length))*6.2+10)));
  });
  return {left:Math.max(42,widths[0]||0),right:widths.slice(1)};
 }
 function timeTicks(start,end,width,referenceSpan=end-start){
  const calendar=typeof module!=='undefined'?require('./live-card-data.js'):root.WeatherLiveCardData;
  const day=86400,span=end-start;
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',hourCycle:'h23',hour:'2-digit',minute:'2-digit'});
  const label=(time,options)=>new Date(time*1000).toLocaleString('de-CH',{timeZone:'Europe/Zurich',...options});
  const localDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'});
  const ticks=[],cal=calendar.timeAxis(start,end,referenceSpan>62*day?'8760':'720');
  if(referenceSpan<=2*day){
   const goal=span/Math.max(4,Math.min(54,Math.floor(width/85)));
   const step=[300,600,900,1800,3600,7200,10800,14400,21600,43200].find(value=>value>=goal)||43200;
   for(let time=Math.ceil(start/300)*300;time<=end;time+=300){
    const local=Object.fromEntries(parts.formatToParts(new Date(time*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
    if((local.hour*3600+local.minute*60)%step===0)ticks.push({time,label:label(time,{hour:'2-digit',minute:'2-digit'}),major:local.hour===0&&local.minute===0});
   }
   const groups=cal.days.map(d=>({time:d.time,start:d.start,end:d.end,label:label(d.time,{weekday:'short',day:'2-digit',month:'2-digit'})}));
   return {ticks,midnights:cal.midnights,groups,rotate:false,step,unit:"hour",groupUnit:"day"};
  }
  if(referenceSpan<=62*day){
   const goal=span/day/Math.max(3,Math.floor(width/60)),stride=[1,2,3,5,7,14].find(value=>value>=goal)||14;
   for(const time of cal.midnights){
    const wall=new Date(localDate.format(new Date(time*1000))+'T00:00:00Z');
    if(Math.round(wall.getTime()/86400000)%stride===0)ticks.push({time,label:label(time,{...(referenceSpan<=10*day?{weekday:'short'}:{}),day:'2-digit',month:'2-digit'}),major:true});
   }
   return {ticks,midnights:[],groups:cal.groups.map(g=>({time:g.time,start:g.start,end:g.end,label:label(g.time,{month:'long',year:'numeric'})})),rotate:false,unit:"day",groupUnit:"month"};
  }
  const stride=Math.max(1,Math.ceil(cal.months.length*48/width));
  cal.months.forEach((month,index)=>{
   const local=label(month.start,{day:'2-digit',hour:'2-digit',minute:'2-digit'});
   if(!local.startsWith('01')||!local.endsWith('00:00')||index%stride)return;
   ticks.push({time:month.start,label:month.label,major:label(month.start,{month:'2-digit'})==='01'});
  });
  return {ticks,midnights:[],groups:cal.groups.map(group=>({time:group.time,start:group.start,end:group.end,label:group.label})),rotate:true,unit:"month",groupUnit:"year"};
 }
 function timeCells(axis,start,end){
  const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  const alternate=(time,unit)=>{
   const p=Object.fromEntries(local.formatToParts(new Date(time*1000)).filter(p=>p.type!=='literal').map(p=>[p.type,+p.value]));
   const day=Math.round(Date.UTC(p.year,p.month-1,p.day)/86400000);
   return (unit==='year'?p.year:unit==='month'?p.year*12+p.month:unit==='day'?day:Math.floor((day*86400+p.hour*3600+p.minute*60)/(axis.step||3600)))%2!==0;
  };
  const boundaries=[start,...axis.ticks.map(t=>t.time).filter(t=>t>start&&t<end),end].sort((a,b)=>a-b);
  const primary=boundaries.slice(1).map((last,i)=>({start:boundaries[i],end:last,alternate:alternate((boundaries[i]+last)/2,axis.unit)}));
  const secondary=axis.groups.map(g=>({start:Math.max(start,g.start),end:Math.min(end,g.end),alternate:alternate(g.time,axis.groupUnit)})).filter(g=>g.end>g.start);
  return {primary,secondary};
 }
 function bufferWindow(window,code,now=Date.now()/1000){
  const span=window.end-window.start,maxSpan=window.period?366*86400:code?10*86400:366*86400;
  const margin=Math.min(span*.5,Math.max(0,maxSpan-span)/2);
  const start=Math.max(code?now-370*86400:0,window.start-margin);
  return {...window,start,end:window.end+margin,observedEnd:Math.min(window.end+margin,now)};
 }
 function cachedSeries(entries,start,end,period){
  const relevant=entries.filter(entry=>entry.end>=start&&entry.start<=end);
  let through=start;
  for(const entry of [...relevant].sort((a,b)=>a.start-b.start))if(entry.start<=through+1)through=Math.max(through,entry.end);
  const covered=through>=end-1,points=new Map();
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Zurich',year:'numeric',month:'2-digit',day:'2-digit'});
  for(const [index,entry] of entries.entries()){
   for(const point of entry.data.points){
    if(!period&&entries.slice(index+1).some(newer=>point.time>=newer.start&&point.time<=newer.end))continue;
    const key=period?(point.key||date.format(new Date(point.time*1000)).slice(0,period==='month'?7:10)):point.first+'|'+point.last;
    const previous=points.get(key),rank=p=>(p.partial?0:1e12)+(p.covered_seconds??p.count??p.last-p.first);
    if(!previous||rank(point)>=rank(previous))points.set(key,point);
   }
  }
  const latest=entries.at(-1)?.data||{points:[]};
  return {covered,data:{...latest,points:[...points.values()].sort((a,b)=>a.time-b.time)}};
 }
 const api={definitions,areas,ranges,resolutions,valid,validViews,defaults,axesFor,geometry,shifted,compass,directionTicks,axisColumns,timeTicks,timeCells,bufferWindow,cachedSeries};
 if(typeof module!=='undefined')module.exports=api;
 else root.WeatherLiveLayout=api;
})(typeof window==='undefined'?this:window);
