/* Calendar-day normals retain the imported daily resolution and missing values. */
(function(root){
 const colors=['#319c65','#a77bdf','#27a9b8','#d58443','#c9689b'];
 function value(period,day){const result=period.byDay?.get(day.slice(5));return Number.isFinite(result)?result:null}
 function deviation(measured,normal){return Number.isFinite(measured)&&Number.isFinite(normal)?measured-normal:null}
 function label(period){return period.name+' · '+period.station}
 const api={colors,value,deviation,label};
 if(typeof module!=='undefined')module.exports=api;else root.WeatherNormalCurves=api;
})(typeof window==='undefined'?this:window);
