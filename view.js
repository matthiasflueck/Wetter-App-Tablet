/* Application chrome and presentation-only diagram scaling. */
(() => {
  const slider=document.getElementById('diagramZoom');
  const output=document.getElementById('diagramZoomValue');
  const stages=[...document.querySelectorAll('.diagram-stage')];
  let percent=100;
  try{const saved=Number(localStorage.getItem('wetter.diagramZoom'));if(Number.isFinite(saved)&&saved>=60&&saved<=140)percent=Math.round(saved/5)*5}catch(e){}
  function resizeStages(){
    for(const stage of stages){
      const host=stage.parentElement;
      if(!stage.getClientRects().length)continue;
      host.style.height=Math.ceil(stage.offsetHeight*percent/100)+'px';
    }
  }
  let pending=false;
  function scheduleResize(){if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;resizeStages()})}
  function apply(){
    slider.value=percent;output.value=percent+' %';slider.setAttribute('aria-valuetext',percent+' Prozent');
    document.documentElement.style.setProperty('--diagram-zoom',percent/100);
    resizeStages();scheduleResize();
    try{localStorage.setItem('wetter.diagramZoom',String(percent))}catch(e){}
  }
  slider.addEventListener('input',()=>{percent=Number(slider.value);apply()});
  const stageObserver=new ResizeObserver(scheduleResize);stages.forEach(stage=>stageObserver.observe(stage));
  const header=document.querySelector('header');
  const headerObserver=new ResizeObserver(()=>document.documentElement.style.setProperty('--header-height',Math.ceil(header.getBoundingClientRect().height)+'px'));
  headerObserver.observe(header);
  window.addEventListener('hashchange',scheduleResize);
  window.addEventListener('resize',scheduleResize);
  apply();
})();
