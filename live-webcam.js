/* Optional public webcam: loaded only on demand, never through the NAS archive. */
(()=>{
 'use strict';
 const root=document.getElementById('view-live'),station=document.getElementById('liveStation'),archive=document.getElementById('openLiveArchive');
 if(!root||!station||!archive)return;
 const cameras={'':{id:'1329896745',name:'Rubigen',provider:'Windy',description:'Webcam Rubigen · bei der eigenen Wetterstation'},abo:[{id:'1292947593',name:'Adelboden Dorf',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},{id:'1131368730',name:'Adelboden Boden',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'}],thu:{id:'1272631648',name:'Thun',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},vis:{id:'1292514877',name:'Visp',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},klo:{id:'1215902258',name:'Zürich Kloten',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},luz:{name:'Luzern',provider:'Roundshot',url:'https://luzerntourismus.roundshot.com/',description:'360°-Panorama · Luzern Tourismus / Roundshot'},nap:{name:'Napf',provider:'webcam.io',url:'https://webcam.io/webcams/9WNDqM',embedUrl:'https://webcam.io/webcams/9WNDqM?embed=true',description:'Kamerabilder und Zeitverlauf · webcam.io'},stg:{id:'1227972392',name:'St. Gallen',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},lag:{name:'Langnau i.E.',provider:'Roundshot',url:'https://langnau.roundshot.com/',description:'360°-Panorama · Langnau Tourismus / Roundshot'},otl:{name:'Locarno · Madonna del Sasso',provider:'Roundshot',url:'https://ascona-locarno.roundshot.com/madonnadelsasso/',description:'360°-Panorama · Ascona-Locarno / Roundshot'},goe:{id:'1271674330',name:'Gösgen · Olten, Alte Brücke',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},int:{id:'1371732007',name:'Interlaken · Neuhaus',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},jun:{name:'Jungfraujoch · Top of Europe',provider:'Roundshot',url:'https://jungfrau.roundshot.com/top-of-europe-jungfraujoch/',description:'360°-Panorama · Jungfraubahnen / Roundshot'},bri:{name:'Brig · Stockalperschloss',provider:'Roundshot',url:'https://brigtourismus.roundshot.com/stockalperschloss/',description:'360°-Panorama · Brig Tourismus / Roundshot'},chz:{name:'Cham · Zug Stadt',provider:'Roundshot',url:'https://zug-stadt.roundshot.com/',description:'360°-Panorama · Zug Stadt / Roundshot'},aro:{name:'Arosa · Dorf',provider:'Roundshot',url:'https://arosadorf.roundshot.com/',description:'360°-Panorama · Arosa Tourismus / Roundshot'},ber:[{name:'Bern Stadt',provider:'Roundshot',url:'https://berntourismus.roundshot.com/hotelbellevuepalace/',description:'Panorama · Hotel Bellevue Palace / Bern Welcome'},{name:'Gurten',provider:'Roundshot',url:'https://gurtenpark.roundshot.com/',description:'Panorama · Gurtenpark / Roundshot'}],arh:{id:'1697041072',name:'Altenrhein · Rheinspitz',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},pil:{name:'Pilatus · Kulm',provider:'Roundshot',url:'https://pilatus.roundshot.com/',description:'360°-Panorama · Pilatus-Bahnen / Roundshot'}};
 const button=document.createElement('button');button.id='liveWebcam';button.type='button';button.setAttribute('aria-label','Webcam öffnen');button.innerHTML='<svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/></svg>';button.title='Webcam der gewählten Wetterstation öffnen';button.hidden=true;archive.before(button);
 const dialog=document.createElement('dialog');dialog.id='liveWebcamDialog';dialog.setAttribute('aria-labelledby','liveWebcamTitle');
 const header=document.createElement('div');header.className='live-webcam-heading';
 const title=document.createElement('h3');title.id='liveWebcamTitle';
 const close=document.createElement('button');close.type='button';close.textContent='Schliessen';close.setAttribute('aria-label','Webcam schliessen');
 header.append(title,close);
 const choices=document.createElement('div');choices.className='live-webcam-choices';choices.setAttribute('role','group');choices.setAttribute('aria-label','Webcam auswählen');
 const content=document.createElement('div');content.className='live-webcam-player';
 const note=document.createElement('p');note.className='live-webcam-source';
 const link=document.createElement('a');link.textContent='Webcam via Windy · Original öffnen';link.target='_blank';link.rel='noopener noreferrer';
 const description=document.createTextNode('');note.append(link,description);
 dialog.append(header,choices,content,note);document.body.append(dialog);
 function stop(){content.replaceChildren()}
 function dismiss(){if(dialog.open)dialog.close();stop()}
 function reflect(){const camera=cameras[station.value];button.hidden=!camera;if(dialog.open)dismiss()}
 function showCamera(camera){
  content.hidden=false;note.hidden=false;
  for(const option of choices.children)option.setAttribute('aria-pressed',String(option.dataset.camera===(camera.id||camera.url)));
  title.textContent='Webcam · '+camera.name;link.href=camera.url||'https://www.windy.com/webcams/'+camera.id;link.textContent='Webcam via '+camera.provider+' · Original öffnen';description.textContent=' · '+camera.description;
  const frame=document.createElement('iframe');frame.title='Webcam '+camera.name;frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  // Official player endpoint supplied by Windy's embed configurator for this camera.
  const url=new URL(camera.embedUrl||camera.url||'https://webcams.windy.com/webcams/public/embed/player');
  if(!camera.url)for(const [key,value] of Object.entries({webcamId:camera.id,playerType:'day',loop:'0',autoPlay:'0',autoFullScreenOnOverlayPlay:'0',interactive:'1'}))url.searchParams.set(key,value);
  frame.src=url.href;content.replaceChildren(frame);if(!dialog.open)dialog.showModal();
 };
 function openStation(code){
  const value=cameras[code];if(!value)return;
  const list=Array.isArray(value)?value:[value];
  stop();choices.replaceChildren();choices.hidden=list.length<2;content.hidden=true;note.hidden=true;
  if(list.length===1){showCamera(list[0]);return}
  title.textContent='Webcam · '+([...station.options].find(o=>o.value===code)?.textContent||code).split(' · ')[0];
  for(const camera of list){
   const option=document.createElement('button');option.type='button';option.textContent=camera.name;option.dataset.camera=camera.id||camera.url;option.setAttribute('aria-pressed','false');option.onclick=()=>showCamera(camera);choices.append(option);
  }
  dialog.showModal();
 };
 button.onclick=()=>openStation(station.value);
 window.WeatherWebcams={has:code=>!!cameras[code],open:openStation,list:()=>Object.entries(cameras).flatMap(([code,value])=>(Array.isArray(value)?value:[value]).map(camera=>({...camera,station:code}))),show:camera=>{stop();choices.replaceChildren();choices.hidden=true;showCamera(camera)}};
 close.onclick=dismiss;dialog.addEventListener('close',stop);station.addEventListener('change',reflect);
 window.addEventListener('hashchange',()=>{if(location.hash!=='#live')dismiss()});reflect();
})();
