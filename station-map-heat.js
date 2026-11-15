/* Station-based IDW estimate. No forecast model and no invented observations. */
(function(root){
 'use strict';
 const scales={
  temperature_c:{stops:[[-25,'#7650a5'],[-10,'#397dc1'],[0,'#78bacd'],[10,'#63a34c'],[20,'#d6c54a'],[30,'#ea8e43'],[40,'#c74344']]},
  humidity_percent:{stops:[[0,'#e6bc65'],[30,'#aabf7b'],[60,'#65b6ba'],[80,'#478fc2'],[100,'#6856a5']]},
  rain_total_mm:{stops:[[0,'#c8dce1'],[.5,'#72c4c9'],[2,'#4199cd'],[5,'#4d68b8'],[10,'#9452a3'],[20,'#c04c78']]},
  wind_kmh:{stops:[[0,'#a0c9be'],[10,'#70bca5'],[25,'#66a5c4'],[50,'#7e79be'],[80,'#ce7488'],[120,'#d54f52']]},
  gust_kmh:{stops:[[0,'#a0c9be'],[10,'#70bca5'],[25,'#66a5c4'],[50,'#7e79be'],[80,'#ce7488'],[120,'#d54f52']]},
  pressure_hpa:{stops:[[600,'#7868a8'],[750,'#5a95c4'],[900,'#6cb9bd'],[1000,'#b8c97e'],[1050,'#dfad62']]},
  pressure_qff_hpa:{stops:[[970,'#7565aa'],[990,'#569cc3'],[1010,'#86bfa2'],[1030,'#d8bf67'],[1050,'#df8e56']]},
  solar_wm2:{stops:[[0,'#8796ad'],[100,'#97b5b4'],[300,'#c6c879'],[600,'#e7bb53'],[900,'#e88f46'],[1200,'#cc5948']]},
  uv_index:{stops:[[0,'#8cbea9'],[2,'#81b25f'],[5,'#d9c15c'],[7,'#e4a04a'],[10,'#ce6665'],[13,'#8c62a1']]}
 };
 function rgb(hex){return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16))}
 function color(key,value){const stops=scales[key]?.stops;if(!stops||!Number.isFinite(value))return null;let a=stops[0],b=stops.at(-1);if(value<=a[0])return rgb(a[1]);if(value>=b[0])return rgb(b[1]);for(let i=1;i<stops.length;i++)if(value<=stops[i][0]){a=stops[i-1];b=stops[i];break}const t=(value-a[0])/(b[0]-a[0]),ac=rgb(a[1]),bc=rgb(b[1]);return ac.map((c,i)=>Math.round(c+(bc[i]-c)*t))}
 function interpolate(samples,x,y){const nearest=samples.map(s=>({sample:s,d2:(s.x-x)**2+(s.y-y)**2})).filter(s=>Number.isFinite(s.sample.value)&&Number.isFinite(s.d2)).sort((a,b)=>a.d2-b.d2).slice(0,6);if(!nearest.length)return null;if(nearest[0].d2<1e-10)return {value:nearest[0].sample.value,distance:0};let total=0,weight=0;for(const s of nearest){const w=1/s.d2;total+=s.sample.value*w;weight+=w}return {value:total/weight,distance:Math.sqrt(nearest[0].d2)}}

 // Keep sensor channels separate: indoor pressure/rain temperatures are not outdoor air temperature.
 function stationValues(state){const fields={thermohygro:['temperature_c','humidity_percent'],rain:['rain_total_mm'],wind:['wind_kmh','gust_kmh','wind_direction_degrees'],pressure:['pressure_hpa','pressure_qff_hpa'],solar:['solar_wm2','uv_index'],lightning:['lightning_count','lightning_distance_km']},result={};for(const sensor of state?.sensors||[])for(const key of fields[sensor.kind]||[]){const obs=sensor.observation,value=obs?.values?.[key];if(Number.isFinite(value))result[key]={value,stamp:obs.value_times?.[key]??obs.measured_at,provider:sensor.provider}}return result}
 function decodeTerrain(model){if(!model||model.encoding!=='uint16-le')return null;const bytes=atob(model.heights);if(bytes.length!==model.width*model.height*2)return null;const heights=new Uint16Array(model.width*model.height);for(let i=0;i<heights.length;i++)heights[i]=bytes.charCodeAt(i*2)+256*bytes.charCodeAt(i*2+1);return {...model,heights}}
 function terrainHeight(model,u,v){if(!model||![u,v].every(Number.isFinite)||u<0||u>1||v<0||v>1)return null;const x=Math.max(0,Math.min(model.width-1,u*model.width-.5)),y=Math.max(0,Math.min(model.height-1,v*model.height-.5)),x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(model.width-1,x0+1),y1=Math.min(model.height-1,y0+1),dx=x-x0,dy=y-y0;return (model.heights[y0*model.width+x0]*(1-dx)+model.heights[y0*model.width+x1]*dx)*(1-dy)+(model.heights[y1*model.width+x0]*(1-dx)+model.heights[y1*model.width+x1]*dx)*dy}
 // ICAO standard gradient: 6.5 °C/km. Local inversions are not reconstructed by this approximation.
 function prepareTemperature(samples,lapse=.0065){const originals=samples.filter(s=>Number.isFinite(s.height));return {originals,lapse,samples:originals.map(s=>({...s,value:s.value+lapse*s.height}))}}
 function temperatureAt(prepared,x,y,height){if(!Number.isFinite(height))return null;if(Array.isArray(prepared))prepared=prepareTemperature(prepared);const exact=prepared.originals.find(s=>(s.x-x)**2+(s.y-y)**2<1e-10);if(exact)return {value:exact.value,distance:0};const estimate=interpolate(prepared.samples,x,y);return estimate?{...estimate,value:estimate.value-prepared.lapse*height}:null}

 const api={scales,color,interpolate,stationValues,decodeTerrain,terrainHeight,prepareTemperature,temperatureAt};if(typeof module!=='undefined')module.exports=api;else root.WeatherStationHeat=api;
})(typeof window==='undefined'?this:window);
