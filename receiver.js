/* Shared by tablet shells: validate downloads before one atomic storage activation. */
(function(root){
  const SETTINGS=['preferences','thunder','diagramZoom','timelineValues','yAxes','chartOrder','timelineFog','chartHeights','temperatureNormals','annualNorm','comparisonNorm'];
  const METRICS=['temperature','rain','solar','uv','gust','wind','humidity'];
  function ensure(condition,message){if(!condition)throw Error(message)}
  function validateMobile(data,publication){
    ensure(data?.format==='wetter-app-mobile'&&data.schema_version===1,'Nicht unterstütztes Tablet-Datenformat');
    ensure(data.bundle_id===publication.bundle_id&&data.data_version===publication.data_version,'Datenversion stimmt nicht überein');
    ensure(Number.isSafeInteger(data.measurements)&&data.measurements>0&&data.measurements===publication.measurements,'Messwertanzahl stimmt nicht überein');
    ensure(data.daily?.version===data.data_version&&Number.isFinite(data.daily.last_utc),'Tagesdaten ungültig');
    ensure(data.daily.metrics&&typeof data.daily.metrics==='object','Messgrössen fehlen');
    for(const metric of Object.keys(data.daily.metrics))ensure([...METRICS,'pressure','pressure_sea','dewpoint'].includes(metric),'Unbekannte Messgrösse');
    for(const metric of new Set([...METRICS,...Object.keys(data.daily.metrics)])){
      const rows=data.daily.metrics?.[metric];ensure(Array.isArray(rows),'Messgrösse fehlt: '+metric);
      let last='';
      for(const row of rows){
        ensure(/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&row.day>last,'Tagesreihenfolge ungültig');last=row.day;
        for(const key of ['samples','valid_samples','suspicious_values'])if(row[key]!==undefined)ensure(Number.isSafeInteger(row[key])&&row[key]>=0,'Ungültige Messwertanzahl');
        if(row.samples!==undefined&&row.valid_samples!==undefined)ensure(row.valid_samples<=row.samples,'Ungültige Messwertanzahl');
        for(const key of ['minimum','maximum','mean'])ensure(row[key]===null||Number.isFinite(row[key]),'Ungültiger Tageswert');
      }
    }
    ensure(data.settings&&typeof data.settings==='object'&&!Array.isArray(data.settings),'Einstellungen fehlen');
    ensure(Object.keys(data.settings).every(key=>SETTINGS.includes(key)),'Unbekannte Einstellungen');
    const settings=data.settings;
    if(settings.diagramZoom!==undefined)ensure(Number.isFinite(settings.diagramZoom)&&settings.diagramZoom>=60&&settings.diagramZoom<=140,'Ungültiger Zoom');
    if(settings.timelineValues!==undefined)ensure(typeof settings.timelineValues==='boolean','Ungültige Werteanzeige');
    if(settings.preferences!==undefined)ensure(settings.preferences&&['dark','light'].includes(settings.preferences.theme),'Ungültige Darstellung');
    if(settings.preferences?.diagramBackgroundEnabled!==undefined)ensure(typeof settings.preferences.diagramBackgroundEnabled==='boolean','Ungültiger Diagrammhintergrund');
    if(settings.preferences?.diagramBackgroundColor!==undefined)ensure(settings.preferences.diagramBackgroundColor===''||/^#[0-9a-f]{6}$/i.test(settings.preferences.diagramBackgroundColor),'Ungültige Hintergrundfarbe');
    if(settings.yAxes!==undefined)for(const [key,range] of Object.entries(settings.yAxes))ensure(['temperature','rain','solar','wind','humidity','uv'].includes(key)&&Number.isFinite(range.min)&&Number.isFinite(range.max)&&range.min<range.max,'Ungültige Achsengrenzen');
    if(settings.chartOrder!==undefined)ensure(Array.isArray(settings.chartOrder)&&settings.chartOrder.length===5&&new Set(settings.chartOrder).size===5&&settings.chartOrder.every(id=>['temperature','rain','solar','wind','humidity'].includes(id)),'Ungültige Diagrammreihenfolge');
    if(settings.thunder!==undefined)ensure(Number.isInteger(settings.thunder.count)&&settings.thunder.count>=0&&Number.isFinite(settings.thunder.distance)&&settings.thunder.distance>=0,'Ungültige Gewitterschwellen');
    if(settings.timelineFog!==undefined)ensure(typeof settings.timelineFog==='boolean','Ungültige Hochnebelanzeige');
    if(settings.chartHeights!==undefined)for(const [key,value] of Object.entries(settings.chartHeights))ensure(['temperature','rain','solar','wind','humidity'].includes(key)&&Number.isFinite(value)&&value>=240&&value<=1000,'Ungültige Diagrammhöhe');
    if(settings.temperatureNormals!==undefined)ensure(Array.isArray(settings.temperatureNormals)&&settings.temperatureNormals.length<=100&&settings.temperatureNormals.every(id=>typeof id==='string'&&id.length<=120),'Ungültige Normauswahl');
    for(const key of ['annualNorm','comparisonNorm'])if(settings[key]!==undefined)ensure(typeof settings[key]==='string'&&settings[key].length<=120,'Ungültige Normauswahl');
    if(data.device_defaults!==undefined)validateMobile({...data,settings:data.device_defaults,device_defaults:undefined,references:undefined},publication);
    if(data.references!=null){
      const refs=data.references;ensure(refs.schema_version===1&&refs.fog_algorithm_version===2&&refs.time_basis==='Europe/Zurich','Unbekanntes Referenzformat');
      ensure(Array.isArray(refs.normals)&&refs.normals.length<=1000,'Ungültige Normperioden');
      const ids=new Set();for(const period of refs.normals){ensure(typeof period.id==='string'&&!ids.has(period.id)&&typeof period.name==='string'&&typeof period.station==='string'&&Array.isArray(period.daily)&&period.daily.length<=366,'Ungültige Normperiode');ids.add(period.id);const days=new Set();for(const row of period.daily){ensure(/^\d{2}-\d{2}$/.test(row.day)&&!days.has(row.day),'Ungültiger Normtag');days.add(row.day);for(const [key,value] of Object.entries(row))if(key!=='day')ensure(value===null||Number.isFinite(value),'Ungültiger Normwert')}}
      ensure(refs.fog?.version===data.data_version&&Array.isArray(refs.fog.daily)&&refs.fog.settings&&typeof refs.fog.settings.start_date==='string','Ungültige Hochnebeldaten');
      let previous='';for(const row of refs.fog.daily){ensure(/^\d{4}-\d{2}-\d{2}$/.test(row.day)&&row.day>previous&&typeof row.fog==='boolean'&&typeof row.evaluated==='boolean','Ungültiger Hochnebeltag');previous=row.day}
    }
    ensure(Array.isArray(data.daily.thunder),'Gewitterdaten fehlen');
    return data;
  }
  async function sha256(buffer){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',buffer))].map(v=>v.toString(16).padStart(2,'0')).join('')}
  async function verifiedDownload(fetcher,reference,maxBytes){
    ensure(reference&&typeof reference.file_id==='string'&&/^[a-zA-Z0-9_-]+$/.test(reference.file_id)&&Number.isSafeInteger(reference.bytes)&&reference.bytes>0&&reference.bytes<=maxBytes&&/^[a-f0-9]{64}$/.test(reference.sha256),'Ungültiger Dateiverweis');
    const response=await fetcher('https://www.googleapis.com/drive/v3/files/'+reference.file_id+'?alt=media');
    ensure(response.ok,'Google-Download fehlgeschlagen');
    const reader=response.body.getReader(),chunks=[];let total=0;
    for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>reference.bytes){await reader.cancel();throw Error('Download grösser als angekündigt')}chunks.push(value)}
    ensure(total===reference.bytes,'Download unvollständig');const blob=new Blob(chunks),buffer=await blob.arrayBuffer();
    ensure(await sha256(buffer)===reference.sha256,'Prüfsumme stimmt nicht überein');return blob;
  }
  async function receive(fetcher,publication,storage,progress=()=>{}){
    ensure(publication?.format==='wetter-app-publication'&&publication.schema_version===1,'Veröffentlichungsformat unbekannt');
    progress('Tagesdaten und Einstellungen werden geladen …');
    const mobileBlob=await verifiedDownload(fetcher,publication.mobile,32*1024*1024);
    const mobile=validateMobile(JSON.parse(await mobileBlob.text()),publication);
    progress('Originalmessdaten werden offline gespeichert …');
    const raw=await verifiedDownload(fetcher,publication,512*1024*1024);
    progress('Geprüfter Datenstand wird aktiviert …');
    const record={publication,mobile,raw,received_utc:new Date().toISOString()};
    await storage.activate(record);return record;
  }
  const api={SETTINGS,validateMobile,verifiedDownload,receive,sha256};
  if(typeof module!=='undefined')module.exports=api;else root.WeatherReceiver=api;
})(typeof window==='undefined'?this:window);
