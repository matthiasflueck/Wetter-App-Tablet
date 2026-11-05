/* Offline read adapter over the same verified daily summaries used on desktop. */
(function(root){
 const metrics={rain:['Niederschlag','mm'],temperature:['Temperatur','°C'],humidity:['Luftfeuchtigkeit','%'],pressure:['Luftdruck am Stationsort (QFE)','hPa'],pressure_sea:['Berechneter Meeresspiegeldruck (QFF)','hPa'],wind:['Windgeschwindigkeit','km/h'],gust:['Windböen','km/h'],dewpoint:['Taupunkt','°C'],solar:['Solarstrahlung','W/m²'],uv:['UV-Index','']};
 const stamp=day=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||new Date(day+'T00:00:00Z').toISOString().slice(0,10)!==day)throw Error('Ungültiges Datum');return Date.parse(day+'T00:00:00Z')};
 function series(snapshot,query){
  const metric=query.get('metric')||'temperature',resolution=query.get('resolution')||'day';
  if(!metrics[metric]||!['day','month','year'].includes(resolution))throw Error('Unbekannte Messgrösse oder Auflösung');
  const source=snapshot.metrics[metric]||[],bounds=snapshot.metrics.temperature||[];
  const start=query.get('start')||bounds[0]?.day,end=query.get('end')||bounds.at(-1)?.day,first=stamp(start),last=stamp(end);
  if(first>last||last-first>36600*86400000)throw Error('Ungültiger Zeitraum (maximal 100 Jahre)');
  const map=new Map(source.map(row=>[row.day,row])),daily=[],buckets=new Map();
  let available=false,suspicious=0;
  for(let t=first;t<=last;t+=86400000){const day=new Date(t).toISOString().slice(0,10),original=map.get(day),row={day,samples:original?.samples||0,valid_samples:original?.valid_samples||0,mean:original?.mean??null,minimum:original?.minimum??null,maximum:original?.maximum??null};
   if(metric==='rain')row.sum=original?.sum??null;
   available||=!!original?.available;suspicious+=original?.suspicious_values||0;daily.push(row);
   const key=resolution==='day'?day:resolution==='month'?day.slice(0,7):day.slice(0,4);
   if(!buckets.has(key))buckets.set(key,{day,period:key,end:day,samples:0,valid_samples:0,total:0,minimum:null,maximum:null,requested_days:0,days_with_values:0,...(metric==='rain'?{sum:0}:{})});
   const b=buckets.get(key);b.end=day;b.requested_days++;b.samples+=row.samples;b.valid_samples+=row.valid_samples;
   if(metric==='rain')b.sum+=row.sum||0;
   if(row.mean!==null&&row.valid_samples){b.days_with_values++;b.total+=row.mean*row.valid_samples;b.minimum=b.minimum===null?row.minimum:Math.min(b.minimum,row.minimum);b.maximum=b.maximum===null?row.maximum:Math.max(b.maximum,row.maximum)}
  }
  const periods=[...buckets.values()].map(b=>{b.mean=b.valid_samples?b.total/b.valid_samples:null;delete b.total;const y=Number(b.day.slice(0,4));b.calendar_days=resolution==='day'?1:resolution==='month'?new Date(Date.UTC(y,Number(b.day.slice(5,7)),0)).getUTCDate():(Date.UTC(y+1,0,1)-Date.UTC(y,0,1))/86400000;b.partial=b.requested_days<b.calendar_days||b.days_with_values<b.requested_days;if(metric==='rain'&&!b.valid_samples)b.sum=null;return b});
  const valid=daily.filter(row=>row.valid_samples),min=valid.length?Math.min(...valid.map(r=>r.minimum)):null,max=valid.length?Math.max(...valid.map(r=>r.maximum)):null;
  return {metric,resolution,label:metrics[metric][0],unit:metrics[metric][1],start,end,available,daily,periods,summary:{days_requested:daily.length,days_with_values:valid.length,day_presence_percent:Math.round(1000*valid.length/daily.length)/10,suspicious_values:suspicious,samples:daily.reduce((s,r)=>s+r.samples,0),valid_samples:daily.reduce((s,r)=>s+r.valid_samples,0),missing_days:daily.filter(r=>!r.samples).length,days_without_values:daily.length-valid.length,minimum:min,maximum:max}};
 }
 function seedPreferences(storage,settings){
  // Device preferences are seeded once; shared brand text and thresholds follow the publication.
  for(const key of ['preferences','diagramZoom','timelineValues','timelineFog','yAxes','chartOrder','chartHeights','temperatureNormals','annualNorm','comparisonNorm','thunder']){
   const name='wetter.'+key;if(storage.getItem(name)!==null||settings[key]===undefined)continue;
   storage.setItem(name,['annualNorm','comparisonNorm'].includes(key)?settings[key]:JSON.stringify(settings[key]));
  }
  if(settings.thunder!==undefined)storage.setItem('wetter.thunder',JSON.stringify(settings.thunder));
  if(typeof settings.preferences?.headerSubtitle==='string'){let preferences={};try{preferences=JSON.parse(storage.getItem('wetter.preferences')||'{}')}catch(e){}preferences.headerSubtitle=settings.preferences.headerSubtitle;storage.setItem('wetter.preferences',JSON.stringify(preferences))}
 }
 const api={series,seedPreferences};if(typeof module!=='undefined')module.exports=api;else root.WeatherTabletData=api;
})(typeof window==='undefined'?this:window);
