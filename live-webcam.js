/* Optional public webcam: loaded only on demand, never through the NAS archive. */
(()=>{
 'use strict';
 const root=document.getElementById('view-live'),station=document.getElementById('liveStation'),archive=document.getElementById('openLiveArchive');
 if(!root||!station||!archive)return;
 const cameras={arh:{id:'1697041072',name:'Altenrhein · Rheinspitz',provider:'Windy',description:'Aktualisierte Kamerabilder / 24-Stunden-Verlauf'},pil:{name:'Pilatus · Kulm',provider:'Roundshot',url:'https://pilatus.roundshot.com/',description:'360°-Panorama · Pilatus-Bahnen / Roundshot'}};
 const button=document.createElement('button');button.id='liveWebcam';button.type='button';button.textContent='Webcam';button.title='Webcam der gewählten Wetterstation öffnen';button.hidden=true;archive.before(button);
 const dialog=document.createElement('dialog');dialog.id='liveWebcamDialog';dialog.setAttribute('aria-labelledby','liveWebcamTitle');
 const header=document.createElement('div');header.className='live-webcam-heading';
 const title=document.createElement('h3');title.id='liveWebcamTitle';
 const close=document.createElement('button');close.type='button';close.textContent='Schliessen';close.setAttribute('aria-label','Webcam schliessen');
 header.append(title,close);
 const content=document.createElement('div');content.className='live-webcam-player';
 const note=document.createElement('p');note.className='live-webcam-source';
 const link=document.createElement('a');link.textContent='Webcam via Windy · Original öffnen';link.target='_blank';link.rel='noopener noreferrer';
 const description=document.createTextNode('');note.append(link,description);
 dialog.append(header,content,note);root.append(dialog);
 function stop(){content.replaceChildren()}
 function dismiss(){if(dialog.open)dialog.close();stop()}
 function reflect(){const camera=cameras[station.value];button.hidden=!camera;if(dialog.open)dismiss()}
 button.onclick=()=>{
  const camera=cameras[station.value];if(!camera)return;
  title.textContent='Webcam · '+camera.name;link.href=camera.url||'https://www.windy.com/webcams/'+camera.id;link.textContent='Webcam via '+camera.provider+' · Original öffnen';description.textContent=' · '+camera.description;
  const frame=document.createElement('iframe');frame.title='Webcam '+camera.name;frame.allowFullscreen=true;frame.referrerPolicy='strict-origin-when-cross-origin';
  // Official player endpoint supplied by Windy's embed configurator for this camera.
  const url=new URL(camera.url||'https://webcams.windy.com/webcams/public/embed/player');
  if(!camera.url)for(const [key,value] of Object.entries({webcamId:camera.id,playerType:'day',loop:'0',autoPlay:'0',autoFullScreenOnOverlayPlay:'0',interactive:'1'}))url.searchParams.set(key,value);
  frame.src=url.href;content.replaceChildren(frame);dialog.showModal();
 };
 close.onclick=dismiss;dialog.addEventListener('close',stop);station.addEventListener('change',reflect);
 window.addEventListener('hashchange',()=>{if(location.hash!=='#live')dismiss()});reflect();
})();
