/* Meteorological temperature days; thresholds use unrounded daily extrema. */
(function(root){
  const definitions=[
    {id:'summer',label:'Sommertag',color:'#ffd080',rule:'Tagesmaximum ≥ 25 °C'},
    {id:'heat',label:'Hitzetag',color:'#ff9c73',rule:'Tagesmaximum ≥ 30 °C'},
    {id:'frost',label:'Frosttag',color:'#a9bdf5',rule:'Tagesminimum < 0 °C'},
    {id:'ice',label:'Eistag',color:'#a4ddec',rule:'Tagesmaximum < 0 °C'}
  ];
  function classify(min,max){return definitions.filter(({id})=>id==='summer'?Number.isFinite(max)&&max>=25:id==='heat'?Number.isFinite(max)&&max>=30:id==='frost'?Number.isFinite(min)&&min<0:Number.isFinite(max)&&max<0)}
  const api={definitions,classify};if(typeof module!=='undefined')module.exports=api;else root.WeatherDays=api;
})(typeof window==='undefined'?this:window);
