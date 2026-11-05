/* Year totals and monthly year matrices reuse the annual calendar rules. */
(function(root){
 const {weightedMean}=typeof module!=='undefined'&&module.exports?require('./annual-data.js'):root.WeatherAnnualData;
 const finite=Number.isFinite,mean=a=>a.length?a.reduce((a,b)=>a+b,0)/a.length:null,sum=a=>a.length?a.reduce((a,b)=>a+b,0):null;
 const keys=['temperature','minimum','maximum','rain','rain_days','summer_days','heat_days','frost_days','ice_days','solar','solar_max','uv','wind','gust'];
 function reduce(values,key){return ['temperature','solar','wind'].includes(key)?mean(values):['maximum','solar_max','uv','gust'].includes(key)?values.length?Math.max(...values):null:key==='minimum'?values.length?Math.min(...values):null:sum(values)}
 function aggregate(snapshot,years,period,annual){return years.map(year=>{const data=annual(snapshot,year,period),result={year,days:data.days.length,values:{},norm:{},valid:{},comparison:data.comparison,monthly:data.months,daily:data.days};
  for(const key of keys){const valid=data.days.filter(row=>finite(row[key]));result.valid[key]=valid.length;result.values[key]=['temperature','solar','wind'].includes(key)?weightedMean(valid,key):reduce(valid.map(row=>row[key]),key);const pairs=valid.filter(row=>finite(row.norm[key]));result.norm[key]=['temperature','solar','wind'].includes(key)?weightedMean(pairs,key,row=>row.norm[key]):reduce(pairs.map(row=>row.norm[key]),key)}
  result.monthlyComparison=data.months.map(month=>{const rows=data.days.filter(row=>row.month===month.month),out={};for(const key of keys){const pairs=rows.filter(row=>finite(row[key])&&finite(row.norm[key]));out[key]=['temperature','solar','wind'].includes(key)?weightedMean(pairs,key,row=>row[key]-row.norm[key]):sum(pairs.map(row=>row[key]-row.norm[key]))}return out});return result})}
 const api={aggregate};if(typeof module!=='undefined')module.exports=api;else root.WeatherComparisonData=api;
})(typeof window==='undefined'?this:window);
