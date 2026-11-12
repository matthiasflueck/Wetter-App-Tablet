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
 function geometry(width,height,heights,axisCounts,storm){
  const rightCount=Math.max(0,...axisCounts.map(count=>count-1));
  const gutter=width<700?48:65;
  const left=gutter,right=Math.max(left+100,width-12-rightCount*gutter);
  const top=typeof storm==='number'&&storm>0?storm:storm?38:14,axisHeight=60,gap=14;
  const budget=Math.max(230,height-top-axisHeight-gap);
  const upper=Math.max(190,budget*heights.upper),lower=Math.max(85,budget*heights.lower);
  const split=top+upper-Math.max(62,upper*heights.b),separator=top+upper+gap/2;
  const cTop=top+upper+gap,cBottom=cTop+lower;
  return {left,right,top,separator,bottom:cBottom,height:cBottom+axisHeight,
   areas:{A:{top,bottom:split},B:{top:split,bottom:top+upper},C:{top:cTop,bottom:cBottom}}};
 }
 function shifted(window,fraction){
  const delta=(window.end-window.start)*fraction;
  return {start:window.start+delta,end:window.end+delta};
 }
 const api={definitions,areas,ranges,resolutions,valid,validViews,defaults,axesFor,geometry,shifted};
 if(typeof module!=='undefined')module.exports=api;
 else root.WeatherLiveLayout=api;
})(typeof window==='undefined'?this:window);
