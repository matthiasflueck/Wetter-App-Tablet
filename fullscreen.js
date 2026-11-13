/* Installed fullscreen display mode survives separately from the Fullscreen API. */
(()=>{
 const buttons=[document.getElementById('tabletFullscreen'),document.getElementById('liveFullscreen'),document.getElementById('archiveFullscreen')].filter(Boolean);if(!buttons.length)return;
 const exit=document.getElementById('fullscreenExit');let wanted=false;
 const installedFullscreen=()=>window.matchMedia?.('(display-mode: fullscreen)').matches===true;
 function apply(active){wanted=active;document.body.classList.toggle('focus-mode',active);for(const button of buttons){button.setAttribute('aria-pressed',String(active));button.textContent=active?'Vollbild beenden':'⛶ Vollbild'}exit.hidden=!active;try{localStorage.setItem('wetter.fullscreenFocus',String(active))}catch(e){}window.dispatchEvent(new Event('resize'))}
 async function enterNative(){if(!wanted||document.hidden||document.fullscreenElement||installedFullscreen())return;if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen()}catch(e){/* Focus layout remains usable; a browser may require another tap. */}}}
 async function leave(){apply(false);if(document.fullscreenElement){try{await document.exitFullscreen()}catch(e){}}}
 async function toggle(){if(wanted){await leave();return}apply(true);await enterNative()}
 for(const button of buttons)button.onclick=toggle;exit.onclick=leave;
 // Android may leave element fullscreen when locking. This is not a request
 // to leave the user's focused layout, unlike our exit button or Escape.
 document.addEventListener('fullscreenchange',()=>{if(wanted&&!document.hidden)document.body.classList.add('focus-mode')});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&wanted){document.body.classList.add('focus-mode');window.dispatchEvent(new Event('resize'))}});
 // On browsers that lose native fullscreen, the next real touch supplies the
 // required user activation. Do not consume the touch or intercept Exit.
 document.addEventListener('pointerup',event=>{if(wanted&&!event.target.closest?.('button,input,select,textarea,a,summary'))enterNative()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&wanted)leave()});
 let remembered=false;try{remembered=localStorage.getItem('wetter.fullscreenFocus')==='true'}catch(e){}
 if(remembered)apply(true);
})();
