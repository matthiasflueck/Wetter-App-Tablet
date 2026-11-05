/* Application chrome and presentation-only diagram scaling. */
(() => {
  try{const preferences=JSON.parse(localStorage.getItem('wetter.preferences')||'{}');document.body.classList.toggle('legend-right',preferences.legendPosition==='right')}catch(e){}
  const slider=document.getElementById('diagramZoom');
  const output=document.getElementById('diagramZoomValue');
  const stages=[...document.querySelectorAll('.diagram-stage')];
  let percent=100;
  try{const saved=Number(localStorage.getItem('wetter.diagramZoom'));if(Number.isFinite(saved)&&saved>=60&&saved<=140)percent=Math.round(saved/5)*5}catch(e){}
  function alignLegends(){
    for(const body of document.querySelectorAll('.chart-body')){
      const legend=body.querySelector('.timeline-legend'),svg=body.querySelector('svg');
      if(!legend||!svg||!body.getClientRects().length)continue;
      if(!document.body.classList.contains('legend-right')){legend.style.removeProperty('--legend-offset');legend.style.removeProperty('--legend-shift');continue}
      const box=body.getBoundingClientRect(),plot=svg.getBoundingClientRect();
      const scale=box.width/body.offsetWidth;
      if(!scale||!plot.width)continue;
      // Both chart renderers start their grid at SVG y=30, including any storm strip above it.
      const offset=(plot.top-box.top+plot.width/svg.viewBox.baseVal.width*30)/scale;
      legend.style.setProperty('--legend-offset',Math.max(0,offset)+'px');
      const gridRight=svg.id==='plot'?.975:.935;
      const shift=svg.querySelector('[data-axis-title="right"]')?0:Math.max(0,plot.width*(1-gridRight)/scale-28);
      legend.style.setProperty('--legend-shift',shift+'px');
    }
  }
  function resizeStages(){
    alignLegends();
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
