/* Exact active classification from the reference, including inclusive OR thresholds. */
(function(global){
  const defaults={count:10,distance:10};
  function valid(p){return p&&Number.isInteger(p.count)&&p.count>=0&&Number.isFinite(p.distance)&&p.distance>=0}
  function classify(count,km,p=defaults){
    if(!Number.isFinite(count)||count<=0)return 'none';
    return count>=p.count||(Number.isFinite(km)&&km<=p.distance)?'strong':'normal';
  }
  const api={defaults,valid,classify};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof document==='undefined')return;
  let settings={...defaults};
  try{const saved=JSON.parse(localStorage.getItem('wetter.thunder')||'null');if(valid(saved))settings=saved}catch(e){}
  api.getSettings=()=>({...settings});global.WeatherThunder=api;
  const countInput=document.getElementById('thunderCount'),distanceInput=document.getElementById('thunderDistance'),status=document.getElementById('thunderSettingsStatus');
  const fill=()=>{countInput.value=settings.count;distanceInput.value=settings.distance};fill();
  function save(p){
    if(!valid(p)){status.textContent='Bitte eine ganze Blitzanzahl und eine endliche Distanz eingeben, jeweils mindestens 0.';return}
    settings=p;fill();let persisted=true;
    try{localStorage.setItem('wetter.thunder',JSON.stringify(settings))}catch(e){persisted=false}
    status.textContent=persisted?'Gewitter-Einstellungen gespeichert. Die Anzeige wurde aktualisiert.':'Für diese Sitzung übernommen; dauerhaftes Speichern ist nicht verfügbar.';
    global.dispatchEvent(new Event('weather-thunder-changed'));
  }
  document.getElementById('saveThunder').onclick=()=>{
    if(!countInput.value.trim()||!distanceInput.value.trim()){status.textContent='Bitte beide Schwellenwerte eingeben.';return}
    save({count:Number(countInput.value),distance:Number(distanceInput.value)});
  };
  document.getElementById('resetThunder').onclick=()=>save({...defaults});
})(typeof window!=='undefined'?window:globalThis);
