/* A read-only HTTPS bridge: provider keys never enter the public tablet build. */
(function(root){
 function validateEndpoint(value){const url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('Bitte eine HTTPS-Adresse ohne Zugangsdaten oder Zusatzparameter eingeben.');return url.href}
 function validateState(data){
  if(!data||!Array.isArray(data.sensors)||data.sensors.length>20||!Number.isFinite(data.server_time))throw Error('Ungültige Live-Antwort');
  const kinds=['thermohygro','rain','wind','pressure','solar','lightning'],keys=new Set();
  for(const sensor of data.sensors){if(typeof sensor.key!=='string'||keys.has(sensor.key)||typeof sensor.name!=='string'||!kinds.includes(sensor.kind)||!['tfa_weatherhub','ecowitt'].includes(sensor.provider)||!Number.isFinite(sensor.next_refresh_at))throw Error('Ungültige Live-Sensordaten');keys.add(sensor.key);const value=sensor.observation;if(value){if(!Number.isFinite(value.measured_at)||!value.values||typeof value.values!=='object')throw Error('Ungültiger Live-Messwert');for(const v of Object.values(value.values))if(v!==null&&!Number.isFinite(v))throw Error('Ungültiger Live-Messwert')}}
  return data;
 }
 async function read(fetcher,connection,signal){
  if(!connection)throw Error('Bitte unter Einstellungen den Live-Zugang einrichten.');
  const url=validateEndpoint(connection.url),controller=new AbortController(),abort=()=>controller.abort(),timer=setTimeout(abort,25000);
  signal?.addEventListener('abort',abort,{once:true});if(signal?.aborted)abort();
  try{const response=await fetcher(url,{headers:{Authorization:'Bearer '+connection.token},cache:'no-store',credentials:'omit',redirect:'error',signal:controller.signal});if(!response.ok)throw Error(response.status===401?'Live-Zugang ungültig. Bitte den Zugangsschlüssel prüfen.':'Live-Dienst momentan nicht erreichbar.');const text=await response.text();if(text.length>262144)throw Error('Live-Antwort zu gross');return validateState(JSON.parse(text))}finally{clearTimeout(timer);signal?.removeEventListener('abort',abort)}
 }
 const api={validateEndpoint,validateState,read};if(typeof module!=='undefined')module.exports=api;else root.WeatherTabletLive=api;
})(typeof window==='undefined'?this:window);
