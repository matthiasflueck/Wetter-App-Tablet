/* Optional public webcam: loaded only on demand, never through the NAS archive. */
(()=>{
 'use strict';
 const root=document.getElementById('view-live'),station=document.getElementById('liveStation'),archive=document.getElementById('openLiveArchive');
 if(!root||!station||!archive)return;
 const cameras={ber:[{name:'Bern Stadt',provider:'Roundshot',url:'https://berntourismus.roundshot.com/hotelbellevuepalace/',description:'Panorama · Hotel Bellevue Palace / Bern Welcome'},{name:'Gurten',provider:'Roundshot',url:'https://gurtenpark.roundshot.com/',description:'Panorama · Gurtenpark / Roundshot'}],arh:{id:'1697041072',name:'Altenrhein · Rheinspitz',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},pil:{name:'Pilatus · Kulm',provider:'Roundshot',url:'https://pilatus.roundshot.com/',description:'360°-Panorama · Pilatus-Bahnen / Roundshot'}};
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
 dialog.append(header,choices,content,note);root.append(dialog);
 function stop(){content.replaceChildren()}
 function dismiss(){if(dialog.open)dialog.close();stop()}
 function reflect(){const camera=cameras[station.value];button.hidden=!camera;if(dialog.open)dismiss()}
 function showCamera(camera){
  content.hidden=false;note.hidden=false;
  for(const option of choices.children)option.setAttribute('aria-pressed',String(option.dataset.url===camera.url));
  title.textContent='Webcam · '+camera.name;link.href=camera.url||'https://www.windy.com/webcams/'+camera.id;link.textContent='Webcam via '+camera.provider+' · Original öffnen';description.textContent=' · '+camera.description;
  const frame=document.createElement('iframe');frame.title='Webcam '+camera.name;frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  // Official player endpoint supplied by Windy's embed configurator for this camera.
  const url=new URL(camera.url||'https://webcams.windy.com/webcams/public/embed/player');
  if(!camera.url)for(const [key,value] of Object.entries({webcamId:camera.id,playerType:'day',loop:'0',autoPlay:'0',autoFullScreenOnOverlayPlay:'0',interactive:'1'}))url.searchParams.set(key,value);
  frame.src=url.href;content.replaceChildren(frame);if(!dialog.open)dialog.showModal();
 };
 button.onclick=()=>{
  const value=cameras[station.value];if(!value)return;
  const list=Array.isArray(value)?value:[value];
  stop();choices.replaceChildren();choices.hidden=list.length<2;content.hidden=true;note.hidden=true;
  if(list.length===1){showCamera(list[0]);return}
  title.textContent='Webcam · Bern/Zollikofen';
  for(const camera of list){
   const option=document.createElement('button');option.type='button';option.textContent=camera.name;option.dataset.url=camera.url;option.setAttribute('aria-pressed','false');option.onclick=()=>showCamera(camera);choices.append(option);
  }
  dialog.showModal();
 };
 close.onclick=dismiss;dialog.addEventListener('close',stop);station.addEventListener('change',reflect);
 window.addEventListener('hashchange',()=>{if(location.hash!=='#live')dismiss()});reflect();
})();
