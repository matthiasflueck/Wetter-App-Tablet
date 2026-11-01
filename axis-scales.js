/* Fixed scales use all available days, never the visible calendar period. */
(function(root){
  function extent(series,{baseline=false,headroom=.08}={}){
    let min=Infinity,max=-Infinity;
    for(const values of series)for(const value of values)if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value)}
    if(!Number.isFinite(min))return {min:0,max:1};
    if(baseline){min=Math.min(0,min);max=Math.max(0,max)}
    const span=Math.max(max-min,1),step=10**Math.floor(Math.log10(span))/2;
    return {min:Math.floor((min<0?min-span*.08:Math.min(0,min))/step)*step,max:Math.ceil((max+span*headroom)/step)*step};
  }
  function valid(range){return range&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&range.min<range.max}
  const api={extent,valid};
  if(typeof module!=='undefined')module.exports=api;else root.WeatherAxisScales=api;
})(typeof window==='undefined'?this:window);
