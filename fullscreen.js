/* Tablet presentation mode; native fullscreen where supported, focused layout everywhere. */
(()=>{
 const buttons=[document.getElementById('tabletFullscreen'),document.getElementById('liveFullscreen')].filter(Boolean);if(!buttons.length)return;
 const exit=document.getElementById('fullscreenExit');let native=false;
 function apply(active){document.body.classList.toggle('focus-mode',active);for(const button of buttons){button.setAttribute('aria-pressed',String(active));button.textContent=active?'Vollbild beenden':'⛶ Vollbild'}exit.hidden=!active;window.dispatchEvent(new Event('resize'))}
 async function leave(){apply(false);if(document.fullscreenElement){try{await document.exitFullscreen()}catch(e){}}native=false}
 async function toggle(){if(document.body.classList.contains('focus-mode')){await leave();return}apply(true);if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen();native=true}catch(e){native=false}}}
 for(const button of buttons)button.onclick=toggle;exit.onclick=leave;
 document.addEventListener('fullscreenchange',()=>{if(native&&!document.fullscreenElement){native=false;apply(false)}});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&document.body.classList.contains('focus-mode'))leave()});
})();
