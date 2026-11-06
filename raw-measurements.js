/* Each operation runs in a worker; cancellation stops decompression immediately. */
window.WeatherRawMeasurements={
 async request(action,record,params={},signal){
  if(!record?.raw)throw Error('Bitte in der Datenverwaltung zuerst die Messdaten herunterladen.');
  const days=record.mobile.daily.metrics.temperature||[],data={raw:record.raw,total:record.mobile.measurements,first:days[0]?.day,last:days.at(-1)?.day};
  return new Promise((resolve,reject)=>{const worker=new Worker('measurement-worker.js');const finish=(callback,value)=>{signal?.removeEventListener('abort',abort);worker.terminate();callback(value)},abort=()=>finish(reject,new DOMException('Abgebrochen','AbortError'));if(signal?.aborted){abort();return}signal?.addEventListener('abort',abort,{once:true});worker.onmessage=event=>event.data.error?finish(reject,Error(event.data.error)):finish(resolve,event.data.result);worker.onerror=()=>finish(reject,Error('Originalmessungen konnten nicht verarbeitet werden. Bitte Chrome aktualisieren und erneut versuchen.'));worker.postMessage({action,data,params})});
 }
};
