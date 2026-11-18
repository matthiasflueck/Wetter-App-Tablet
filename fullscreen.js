/* Installed fullscreen display mode survives separately from the Fullscreen API. */
(()=>{
 const buttons=[document.getElementById('tabletFullscreen'),document.getElementById('liveFullscreen'),document.getElementById('archiveFullscreen'),document.getElementById('stationMapFullscreen')].filter(Boolean);if(!buttons.length)return;
 const exit=document.getElementById('fullscreenExit'),menu=document.getElementById('fullscreenMenuToggle'),navigation=document.getElementById('navigation');let wanted=false,menuOpen=false;
 function setNavigation(open){menuOpen=open;document.body.classList.toggle('fullscreen-nav-open',open);menu?.setAttribute('aria-expanded',String(open));menu?.setAttribute('aria-label',open?'Arbeitsbereiche schliessen':'Arbeitsbereiche öffnen')}
 if(menu&&navigation){
  menu.onclick=()=>setNavigation(!menuOpen);
  navigation.addEventListener('click',event=>{if(event.target.closest?.('a[href]'))setNavigation(false)});
  document.addEventListener('pointerdown',event=>{if(menuOpen&&!menu.contains(event.target)&&!navigation.contains(event.target))setNavigation(false)});
  window.addEventListener('hashchange',()=>setNavigation(false));
 }
 const installedFullscreen=()=>window.matchMedia?.('(display-mode: fullscreen)').matches===true;
 function apply(active){wanted=active;setNavigation(false);if(menu)menu.hidden=!active;document.body.classList.toggle('focus-mode',active);for(const button of buttons){button.setAttribute('aria-pressed',String(active));button.textContent=active?'Vollbild beenden':'⛶ Vollbild'}exit.hidden=false;exit.title=active?'Vollbild beenden':'Vollbild';exit.setAttribute?.('aria-label',exit.title);exit.setAttribute?.('aria-pressed',String(active));exit.innerHTML=active?'<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3v6H3m12-6v6h6M9 21v-6H3m12 6v-6h6"/></svg>':'<svg aria-hidden="true" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3H3v6m12-6h6v6M9 21H3v-6m12 6h6v-6"/></svg>';try{localStorage.setItem('wetter.fullscreenFocus',String(active))}catch(e){}window.dispatchEvent(new Event('resize'))}
 async function enterNative(){if(!wanted||document.hidden||document.fullscreenElement||installedFullscreen())return;if(document.documentElement.requestFullscreen){try{await document.documentElement.requestFullscreen()}catch(e){/* Focus layout remains usable; a browser may require another tap. */}}}
 async function leave(){apply(false);if(document.fullscreenElement){try{await document.exitFullscreen()}catch(e){}}}
 async function toggle(){if(wanted){await leave();return}apply(true);await enterNative()}
 for(const button of buttons)button.onclick=toggle;exit.onclick=toggle;
 // Android may leave element fullscreen when locking. This is not a request
 // to leave the user's focused layout, unlike our exit button or Escape.
 document.addEventListener('fullscreenchange',()=>{if(wanted&&!document.hidden)document.body.classList.add('focus-mode')});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&wanted){document.body.classList.add('focus-mode');window.dispatchEvent(new Event('resize'))}});
 // On browsers that lose native fullscreen, the next real touch supplies the
 // required user activation. Do not consume the touch or intercept Exit.
 document.addEventListener('pointerup',event=>{if(wanted&&!event.target.closest?.('button,input,select,textarea,a,summary'))enterNative()});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&wanted){if(menuOpen){event.preventDefault?.();setNavigation(false);menu?.focus()}else leave()}});
 let remembered=false;try{remembered=localStorage.getItem('wetter.fullscreenFocus')==='true'}catch(e){}
 apply(remembered);
})();
