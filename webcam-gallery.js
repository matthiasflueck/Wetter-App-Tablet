/* Lightweight public webcam overview; full players open only after a tap. */
(()=>{
 'use strict';
 const root=document.getElementById('view-station-map'),dialog=document.getElementById('webcamGallery'),webcams=window.WeatherWebcams;if(!root||!dialog||!webcams)return;
 const measurements=document.getElementById('stationMapTabMeasurements'),cameras=document.getElementById('stationMapTabCameras'),shell=document.getElementById('stationMapShell'),status=document.getElementById('stationMapStatus'),refresh=document.getElementById('stationMapRefresh');
 const previews={"https://luzerntourismus.roundshot.com/":"https://luzerntourismus.roundshot.com/cams/56/thumbnail","https://langnau.roundshot.com/":"https://langnau.roundshot.com/cams/1476/thumbnail","https://ascona-locarno.roundshot.com/madonnadelsasso/":"https://ascona-locarno.roundshot.com/cams/1420/thumbnail","https://jungfrau.roundshot.com/top-of-europe-jungfraujoch/":"https://jungfrau.roundshot.com/cams/1087/thumbnail","https://brigtourismus.roundshot.com/stockalperschloss/":"https://brigtourismus.roundshot.com/cams/1520/thumbnail","https://zug-stadt.roundshot.com/":"https://zug-stadt.roundshot.com/cams/1365/thumbnail","https://arosadorf.roundshot.com/":"https://arosadorf.roundshot.com/cams/1122/thumbnail","https://berntourismus.roundshot.com/hotelbellevuepalace/":"https://berntourismus.roundshot.com/cams/128/thumbnail","https://gurtenpark.roundshot.com/":"https://gurtenpark.roundshot.com/cams/741/thumbnail","https://pilatus.roundshot.com/":"https://pilatus.roundshot.com/cams/155/thumbnail"};
 const grid=document.createElement('div');grid.className='webcam-gallery-grid';dialog.append(grid);
 let firstPreview=null;let started=0,loaded=0,failed=0,total=0,run=0,napfRequest=null;
 const cards=webcams.list().sort((a,b)=>a.name.localeCompare(b.name,'de-CH'));
 function updateStatus(){if(loaded&&firstPreview===null)firstPreview=(performance.now()-started)/1000;status.textContent=loaded+'/'+total+' Vorschauen'+(failed?' · '+failed+' ohne Bild':'')+(loaded?' · erste '+(firstPreview??((performance.now()-started)/1000)).toFixed(1)+' s':'');}
 function previewUrl(camera){return camera.provider==='Windy'?'https://imgproxy.windy.com/_/preview/plain/current/'+camera.id+'/original.jpg':previews[camera.url];}
 function render(){
  run++;napfRequest?.abort();grid.replaceChildren();loaded=failed=0;firstPreview=null;total=cards.length;started=performance.now();updateStatus();
  for(const camera of cards){const imageRun=run;
   const tile=document.createElement('button');tile.type='button';tile.className='webcam-gallery-tile';tile.setAttribute('aria-label',camera.name+' öffnen');
   const media=document.createElement('div');media.className='webcam-gallery-media';
   const caption=document.createElement('div');caption.className='webcam-gallery-caption';const name=document.createElement('strong');name.textContent=camera.name;const source=document.createElement('small');source.textContent=camera.provider;caption.append(name,source);
   const url=previewUrl(camera);
   if(url){const image=document.createElement('img');image.alt='Webcam '+camera.name;image.loading='lazy';image.decoding='async';image.referrerPolicy='strict-origin-when-cross-origin';image.onload=()=>{if(imageRun!==run)return;loaded++;media.classList.add('is-loaded');updateStatus()};image.onerror=()=>{if(imageRun!==run)return;failed++;image.hidden=true;const note=document.createElement('span');note.textContent='Vorschau nicht verfügbar · Kamera öffnen';media.append(note);updateStatus()};image.src=url+'?v='+Math.floor(Date.now()/300000);media.append(image);}
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
 let cameraTab=false,lastRendered=0;
 const active=()=>cameraTab&&location.hash==='#station-map'&&!document.hidden;
 function layout(){if(!active())return;const top=dialog.getBoundingClientRect().top;dialog.style.height=Math.max(260,window.innerHeight-top-24)+'px';}
 function stop(){run++;napfRequest?.abort();grid.replaceChildren();lastRendered=0;}
 function activate(){if(!active()){stop();return}layout();if(!lastRendered||Date.now()-lastRendered>300000){render();lastRendered=Date.now()}else updateStatus();}
 function setTab(value){
  cameraTab=value;for(const [button,selected]of [[measurements,!value],[cameras,value]]){button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1}
  shell.hidden=value;dialog.hidden=!value;document.getElementById('stationMapMetricControl').hidden=value;document.querySelector('.station-map-camera-filter').hidden=value;document.getElementById('stationMapSettings').hidden=value;
  refresh.setAttribute('aria-label',value?'Vorschaubilder aktualisieren':'Kartenmesswerte aktualisieren');refresh.title=value?'Vorschaubilder aktualisieren':'Messwerte aktualisieren';refresh.disabled=false;
  window.dispatchEvent(new Event('weather-station-map-tab-changed'));activate();requestAnimationFrame(layout);
 }
 measurements.onclick=()=>setTab(false);cameras.onclick=()=>setTab(true);
 for(const button of [measurements,cameras])button.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const value=e.key==='Home'?false:e.key==='End'?true:!cameraTab;setTab(value);(value?cameras:measurements).focus()}};
 refresh.addEventListener('click',e=>{if(!cameraTab)return;e.stopImmediatePropagation();render();lastRendered=Date.now()},{capture:true});
 window.addEventListener('hashchange',activate);document.addEventListener('visibilitychange',activate);window.addEventListener('resize',layout);new ResizeObserver(layout).observe(root);
})();
