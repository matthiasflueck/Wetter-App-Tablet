/* Lightweight public webcam overview; full players open only after a tap. */
(()=>{
 'use strict';
 const trigger=document.getElementById('stationMapWebcams'),webcams=window.WeatherWebcams;if(!trigger||!webcams)return;
 const previews={"https://luzerntourismus.roundshot.com/":"https://luzerntourismus.roundshot.com/cams/56/thumbnail","https://langnau.roundshot.com/":"https://langnau.roundshot.com/cams/1476/thumbnail","https://ascona-locarno.roundshot.com/madonnadelsasso/":"https://ascona-locarno.roundshot.com/cams/1420/thumbnail","https://jungfrau.roundshot.com/top-of-europe-jungfraujoch/":"https://jungfrau.roundshot.com/cams/1087/thumbnail","https://brigtourismus.roundshot.com/stockalperschloss/":"https://brigtourismus.roundshot.com/cams/1520/thumbnail","https://zug-stadt.roundshot.com/":"https://zug-stadt.roundshot.com/cams/1365/thumbnail","https://arosadorf.roundshot.com/":"https://arosadorf.roundshot.com/cams/1122/thumbnail","https://berntourismus.roundshot.com/hotelbellevuepalace/":"https://berntourismus.roundshot.com/cams/128/thumbnail","https://gurtenpark.roundshot.com/":"https://gurtenpark.roundshot.com/cams/741/thumbnail","https://pilatus.roundshot.com/":"https://pilatus.roundshot.com/cams/155/thumbnail"};
 const dialog=document.createElement('dialog');dialog.id='webcamGallery';dialog.setAttribute('aria-labelledby','webcamGalleryTitle');
 const header=document.createElement('header'),title=document.createElement('h3');title.id='webcamGalleryTitle';title.textContent='Webcams';
 const status=document.createElement('span');status.setAttribute('role','status');
 const refresh=document.createElement('button');refresh.type='button';refresh.textContent='↻';refresh.title='Vorschaubilder aktualisieren';refresh.setAttribute('aria-label',refresh.title);
 const fullscreen=document.createElement('button');fullscreen.type='button';fullscreen.textContent='⛶';fullscreen.title='Vollbild';fullscreen.setAttribute('aria-label','Webcamübersicht im Vollbild');fullscreen.setAttribute('aria-pressed','false');
 const close=document.createElement('button');close.type='button';close.textContent='×';close.setAttribute('aria-label','Webcamübersicht schliessen');
 header.append(title,status,refresh,fullscreen,close);
 const grid=document.createElement('div');grid.className='webcam-gallery-grid';dialog.append(header,grid);document.body.append(dialog);
 let firstPreview=null;let enteredFullscreen=false,started=0,loaded=0,failed=0,total=0,run=0,napfRequest=null;
 const cards=webcams.list().sort((a,b)=>a.name.localeCompare(b.name,'de-CH'));
 function updateStatus(){if(loaded&&firstPreview===null)firstPreview=(performance.now()-started)/1000;status.textContent=loaded+'/'+total+' Vorschauen'+(failed?' · '+failed+' ohne Bild':'')+(loaded?' · erste '+(firstPreview??((performance.now()-started)/1000)).toFixed(1)+' s':'');}
 function previewUrl(camera){return camera.provider==='Windy'?'https://imgproxy.windy.com/_/preview/plain/current/'+camera.id+'/original.jpg':previews[camera.url];}
 function render(){
  run++;napfRequest?.abort();grid.replaceChildren();loaded=failed=0;firstPreview=null;total=cards.length;started=performance.now();updateStatus();
  for(const camera of cards){
   const tile=document.createElement('button');tile.type='button';tile.className='webcam-gallery-tile';tile.setAttribute('aria-label',camera.name+' öffnen');
   const media=document.createElement('div');media.className='webcam-gallery-media';
   const caption=document.createElement('div');caption.className='webcam-gallery-caption';const name=document.createElement('strong');name.textContent=camera.name;const source=document.createElement('small');source.textContent=camera.provider;caption.append(name,source);
   const url=previewUrl(camera);
   if(url){const image=document.createElement('img');image.alt='Webcam '+camera.name;image.loading='lazy';image.decoding='async';image.referrerPolicy='strict-origin-when-cross-origin';image.onload=()=>{loaded++;media.classList.add('is-loaded');updateStatus()};image.onerror=()=>{failed++;image.hidden=true;const note=document.createElement('span');note.textContent='Vorschau nicht verfügbar · Kamera öffnen';media.append(note);updateStatus()};image.src=url+'?v='+Math.floor(Date.now()/300000);media.append(image);}
   else if(camera.provider==='webcam.io'){
    const current=run,image=document.createElement('img');image.alt='Webcam '+camera.name;image.loading='lazy';image.decoding='async';media.append(image);
    const fail=()=>{if(current!==run)return;failed++;image.hidden=true;const note=document.createElement('span');note.textContent='Vorschau nicht verfügbar · Kamera öffnen';media.append(note);updateStatus()};image.onload=()=>{if(current===run){loaded++;updateStatus()}};image.onerror=fail;
    const observer=new IntersectionObserver(entries=>{if(!entries.some(e=>e.isIntersecting))return;observer.disconnect();if(current!==run)return;napfRequest=new AbortController();const request=napfRequest,timeout=setTimeout(()=>request.abort(),10000),now=Date.now(),encode=t=>encodeURIComponent(btoa(new Date(t).toISOString().slice(0,19).replace('T',' ')+' +0000')),query=new URLSearchParams({mode:'0',from:encode(now-3*3600000),to:encode(now+300000)});fetch('https://webcam.io/api/webcams/9WNDqM/images.json?'+query,{headers:{Accept:'application/json'},signal:request.signal}).then(r=>{if(!r.ok)throw Error();return r.json()}).then(data=>{if(current!==run)return;const last=data.images?.at(-1);if(!last?.url||!/^https:\/\/assets[0-9]+\.webcam\.io\//.test(last.url))throw Error();image.src=last.url}).catch(fail).finally(()=>clearTimeout(timeout))},{root:grid,rootMargin:'200px'});observer.observe(media);
   }
   else{const note=document.createElement('span');note.textContent='Kamera öffnen';media.append(note);failed++;}
   tile.append(media,caption);tile.onclick=()=>webcams.show(camera);grid.append(tile);
  }
  updateStatus();
 }
 trigger.onclick=()=>{dialog.showModal();render()};refresh.onclick=render;
 fullscreen.onclick=async()=>{const full=!dialog.classList.contains('is-fullscreen');dialog.classList.toggle('is-fullscreen',full);fullscreen.setAttribute('aria-pressed',String(full));if(full&&!document.fullscreenElement&&dialog.requestFullscreen){try{await dialog.requestFullscreen();enteredFullscreen=true}catch(e){}}else if(!full&&enteredFullscreen&&document.fullscreenElement===dialog){await document.exitFullscreen();enteredFullscreen=false}};
 function stop(){run++;napfRequest?.abort();grid.replaceChildren();dialog.classList.remove('is-fullscreen');fullscreen.setAttribute('aria-pressed','false');if(enteredFullscreen&&document.fullscreenElement===dialog)document.exitFullscreen().catch(()=>{});enteredFullscreen=false;}
 close.onclick=()=>dialog.close();dialog.addEventListener('close',stop);window.addEventListener('hashchange',()=>{if(dialog.open)dialog.close()});
})();
