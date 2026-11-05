/* Daily calendar aggregation: missing days stay missing; comparisons use paired days. */
(function(root){
 const finite=Number.isFinite,mean=a=>a.length?a.reduce((s,v)=>s+v,0)/a.length:null,sum=a=>a.length?a.reduce((s,v)=>s+v,0):null;
 const keys=['temperature','minimum','maximum','rain','rain_days','summer_days','heat_days','frost_days','ice_days','solar','solar_max','uv','wind','gust'];
 function weightedMean(rows,key,value=row=>row[key]){let total=0,weight=0;for(const row of rows){const v=value(row),w=row.weights?.[key]??1;if(finite(v)&&finite(w)&&w>0){total+=v*w;weight+=w}}return weight?total/weight:null}
 function aggregate(snapshot,year,period){
  const maps=Object.fromEntries(Object.entries(snapshot.metrics).map(([k,rows])=>[k,new Map(rows.filter(r=>r.day.startsWith(year+'-')).map(r=>[r.day,r]))]));
  const norms=new Map((period?.daily||[]).map(r=>[r.day,r])),days=[],months=[];
  for(let m=1;m<=12;m++){
   const count=new Date(Date.UTC(year,m,0)).getUTCDate(),rows=[];
   for(let d=1;d<=count;d++){
    const day=year+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0'),temp=maps.temperature?.get(day),rain=maps.rain?.get(day)?.sum,max=temp?.maximum,min=temp?.minimum;
    const row={day,month:m,date:d,temperature:temp?.mean??null,minimum:min??null,maximum:max??null,rain:rain??null,rain_days:finite(rain)?Number(rain>1):null,summer_days:finite(max)?Number(max>=25):null,heat_days:finite(max)?Number(max>=30):null,frost_days:finite(min)?Number(min<0):null,ice_days:finite(max)?Number(max<0):null,solar:maps.solar?.get(day)?.mean??null,solar_max:maps.solar?.get(day)?.maximum??null,uv:maps.uv?.get(day)?.maximum??null,wind:maps.wind?.get(day)?.mean??null,gust:maps.gust?.get(day)?.maximum??null,norm:norms.get(day.slice(5))||{}};
    row.weights=Object.fromEntries([['temperature','temperature'],['solar','solar'],['wind','wind']].map(([key,metric])=>[key,maps[metric]?.get(day)?.valid_samples??1]));
    // In this workspace, zero solar/UV daily values are treated as unavailable.
    if(row.solar===0)row.solar=null;if(row.solar_max===0)row.solar_max=null;if(row.uv===0)row.uv=null;
    row.deviation=finite(row.temperature)&&finite(row.norm.temperature)?row.temperature-row.norm.temperature:null;rows.push(row);days.push(row);
   }
   const month={month:m,days:count,values:{},norm:{},valid:{}};
   for(const key of keys){const values=rows.map(r=>r[key]).filter(finite),normal=rows.map(r=>r.norm[key]).filter(finite);month.valid[key]=values.length;const how=['temperature','solar','wind'].includes(key)?mean:['maximum','solar_max','uv','gust'].includes(key)?a=>a.length?Math.max(...a):null:key==='minimum'?a=>a.length?Math.min(...a):null:sum;month.values[key]=['temperature','solar','wind'].includes(key)?weightedMean(rows,key):how(values);month.norm[key]=['temperature','wind','solar'].includes(key)?mean(normal):sum(normal)}
   months.push(month);
  }
  const comparison={};for(const key of keys){const pairs=days.filter(r=>finite(r[key])&&finite(r.norm[key]));comparison[key]={days:pairs.length,delta:pairs.length?(['temperature','wind','solar'].includes(key)?weightedMean(pairs,key,r=>r[key]-r.norm[key]):sum(pairs.map(r=>r[key]-r.norm[key]))):null}}
  return {year,days,months,comparison};
 }
 const api={aggregate,weightedMean};if(typeof module!=='undefined')module.exports=api;else root.WeatherAnnualData=api;
})(typeof window==='undefined'?this:window);
