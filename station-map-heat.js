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
 const api={scales,color,interpolate};if(typeof module!=='undefined')module.exports=api;else root.WeatherStationHeat=api;
})(typeof window==='undefined'?this:window);
