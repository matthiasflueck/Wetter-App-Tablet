
const $=id=>document.getElementById(id);const fmt=n=>n.toLocaleString('de-CH',{maximumFractionDigits:1});
const workspaces=['live','timeline','annual','comparison','analysis','measurements','data','settings'];
let preferences={theme:'dark',metric:'temperature',resolution:'day',legendPosition:'top',startWorkspace:'timeline',headerSubtitle:'Deine Wetterstation. Deine Analyse.',diagramBackgroundEnabled:true,diagramBackgroundColor:''};
try{const saved=JSON.parse(localStorage.getItem('wetter.preferences')||'{}');if(typeof saved.diagramBackgroundEnabled==='boolean')preferences.diagramBackgroundEnabled=saved.diagramBackgroundEnabled;if(/^#[0-9a-f]{6}$/i.test(saved.diagramBackgroundColor))preferences.diagramBackgroundColor=saved.diagramBackgroundColor;if(workspaces.includes(saved.startWorkspace))preferences.startWorkspace=saved.startWorkspace;if(typeof saved.headerSubtitle==='string'&&saved.headerSubtitle.length<=120)preferences.headerSubtitle=saved.headerSubtitle;if(['top','right'].includes(saved.legendPosition))preferences.legendPosition=saved.legendPosition;if(saved.theme==='light')preferences.theme='light';if([...$('metric').options].some(o=>o.value===saved.metric))preferences.metric=saved.metric;if(['day','month','year'].includes(saved.resolution))preferences.resolution=saved.resolution}catch(e){}
function savePreferences(){try{localStorage.setItem('wetter.preferences',JSON.stringify(preferences));return true}catch(e){return false}}
document.body.classList.toggle('light',preferences.theme==='light');$('metric').value=preferences.metric;$('resolution').value=preferences.resolution;
for(const option of $('metric').options)$('defaultMetric').add(new Option(option.text,option.value));$('defaultMetric').value=preferences.metric;$('defaultResolution').value=preferences.resolution;
$('legendPosition').value=preferences.legendPosition;
function applyBrand(){$('appSubtitle').textContent=preferences.headerSubtitle;$('appSubtitle').hidden=!preferences.headerSubtitle;$('themeMode').textContent=preferences.theme==='light'?'Heller Modus':'Dunkler Modus'}
$('startWorkspace').value=preferences.startWorkspace;$('headerSubtitle').value=preferences.headerSubtitle;
const previewSubtitle=()=>{$('subtitlePreview').textContent=$('headerSubtitle').value||'Ohne Untertitel'};previewSubtitle();applyBrand();$('headerSubtitle').oninput=previewSubtitle;
$('appSettingsForm').onsubmit=e=>{e.preventDefault();preferences.startWorkspace=$('startWorkspace').value;preferences.headerSubtitle=$('headerSubtitle').value.trim();$('headerSubtitle').value=preferences.headerSubtitle;previewSubtitle();applyBrand();$('appSettingsStatus').textContent=savePreferences()?'Gespeichert. Der Startbereich gilt beim nächsten Öffnen.':'Für diese Sitzung übernommen; dauerhaftes Speichern ist nicht verfügbar.'};
$('legendPosition').onchange=()=>{preferences.legendPosition=$('legendPosition').value;document.body.classList.toggle('legend-right',preferences.legendPosition==='right');$('settingsStatus').textContent=savePreferences()?'Legendenposition gespeichert.':'Speichern ist auf diesem Gerät nicht verfügbar.'};
$('theme').onclick=()=>{preferences.theme=document.body.classList.toggle('light')?'light':'dark';applyBrand();applyDiagramBackground();if(!savePreferences())$('settingsStatus').textContent='Die Darstellung konnte auf diesem Gerät nicht dauerhaft gespeichert werden.'};
$('saveSettings').onclick=()=>{preferences.metric=$('defaultMetric').value;preferences.resolution=$('defaultResolution').value;$('settingsStatus').textContent=savePreferences()?'Einstellungen gespeichert. Sie gelten beim nächsten Öffnen.':'Speichern ist auf diesem Gerät nicht verfügbar.'};
function applyDiagramBackground(){const color=preferences.diagramBackgroundColor||(preferences.theme==='light'?'#f1f5f7':'#101820');const surface=preferences.theme==='dark'?'color-mix(in srgb, '+color+' 12%, #101820)':color;document.documentElement.style.setProperty('--chart-surface',preferences.diagramBackgroundEnabled?surface:'transparent');$('diagramBackgroundEnabled').checked=preferences.diagramBackgroundEnabled;$('diagramBackgroundColor').value=color;$('diagramBackgroundColor').disabled=!preferences.diagramBackgroundEnabled}
applyDiagramBackground();
$('diagramBackgroundEnabled').onchange=()=>{preferences.diagramBackgroundEnabled=$('diagramBackgroundEnabled').checked;applyDiagramBackground();savePreferences()};
$('diagramBackgroundDefault').onclick=()=>{preferences.diagramBackgroundColor='';applyDiagramBackground();savePreferences()};
$('diagramBackgroundColor').oninput=()=>{preferences.diagramBackgroundColor=$('diagramBackgroundColor').value;applyDiagramBackground();savePreferences()};
function navigate(){const requested=location.hash.slice(1),route=workspaces.includes(requested)?requested:preferences.startWorkspace;if(requested!==route)history.replaceState(null,'','#'+route);for(const section of document.querySelectorAll('[data-view]'))section.hidden=section.dataset.view!==route;for(const a of $('navigation').querySelectorAll('a')){if(a.hash==='#'+route)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}if(window.matchMedia('(max-width:850px)').matches){$('navigation').classList.remove('open');applyMenu()}}
function applyMenu(){const mobile=window.matchMedia('(max-width:850px)').matches;const expanded=mobile?$('navigation').classList.contains('open'):!document.body.classList.contains('nav-collapsed');$('navToggle').setAttribute('aria-expanded',String(expanded));$('navToggle').textContent=expanded?'‹':'›';$('navToggle').setAttribute('aria-label',expanded?'Menü einklappen':'Menü ausklappen');$('navToggle').title=expanded?'Menü einklappen':'Menü ausklappen';document.body.classList.toggle('nav-open',expanded)}
$('navToggle').onclick=()=>{if(window.matchMedia('(max-width:850px)').matches)$('navigation').classList.toggle('open');else document.body.classList.toggle('nav-collapsed');applyMenu()};window.addEventListener('resize',applyMenu);applyMenu();window.addEventListener('hashchange',navigate);navigate();
let requestId=0;
async function load(year=''){
 try{
  const response=await fetch('/api/data?year='+encodeURIComponent(year));
  if(!response.ok)throw Error('Bitte zuerst in der Datenverwaltung Messdaten herunterladen.');
  const d=await response.json();
  if(!$('year').options.length)for(const y of d.years)$('year').add(new Option(y,y));
  $('year').value=d.year;
  $('start').value=d.year+'-01-01';$('end').value=d.year+'-12-31';
  $('meta').textContent=`Datenversion ${d.report.version} · ${fmt(d.report.valid_rows)} Messungen insgesamt · Europe/Zurich`;
  await loadSeries();
 }catch(e){$('error').textContent=e.message}
}
async function loadSeries(){
 const id=++requestId;$('error').textContent='';$('quality').textContent='Messwerte werden geladen …';
 try{
  const q=new URLSearchParams({metric:$('metric').value,start:$('start').value,end:$('end').value,resolution:$('resolution').value});
  const response=await fetch('/api/series?'+q);const data=await response.json();
  if(id!==requestId)return;
  if(!response.ok)throw Error(data.message);
  const value=n=>n===null?'Keine Werte':fmt(n)+' '+data.unit;
  $('count').textContent=fmt(data.summary.valid_samples);
  $('min').textContent=value(data.summary.minimum);$('max').textContent=value(data.summary.maximum);
  $('chartTitle').textContent=data.label+' · '+({day:'Tageswerte',month:'Monatswerte',year:'Jahreswerte'}[data.resolution]);
  $('unitLabel').textContent='Mittel · Min · Max / '+data.unit;
  $('quality').textContent=`${data.summary.days_without_values} Tage ohne gültige Werte im gewählten Zeitraum. ${data.summary.samples-data.summary.valid_samples} fehlende Einzelwerte.`;
  if(data.summary.suspicious_values)$('quality').textContent+=` Hinweis: ${data.summary.suspicious_values} auffällige Werte sind unverändert enthalten; bitte Datenqualität prüfen.`;
  if(!data.available)$('quality').textContent='Für diese Messgrösse sind im Zeitraum keine Daten verfügbar.';
  $('quality').textContent+=` Messwerte an ${data.summary.days_with_values} von ${data.summary.days_requested} Tagen (${data.summary.day_presence_percent} %). Das ist keine Aussage über lückenlose Messungen innerhalb eines Tages.`;
  draw(data);
 }catch(e){if(id!==requestId)return;$('plot').replaceChildren();$('count').textContent='–';$('min').textContent='–';$('max').textContent='–';$('quality').textContent='';$('hint').textContent='';$('error').textContent=e.message}
}
function draw(data){
 const svg=$('plot');svg.replaceChildren();svg.setAttribute('aria-label',data.label+' in '+data.unit);
 $('hint').textContent='Für Periodenwerte auf eine Kurve zeigen oder tippen.';
 const rows=data.periods.filter(r=>r.mean!==null);if(!rows.length){$('hint').textContent='Keine gültigen Messwerte im Zeitraum.';return}
 const ns='http://www.w3.org/2000/svg';
 function el(tag,attrs,text){const e=document.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))e.setAttribute(k,v);if(text)e.textContent=text;svg.append(e);return e}
 const start=Date.parse(data.start),end=Date.parse(data.end)+86400000;
 const bottom=Math.min(...rows.map(r=>r.minimum)),top=Math.max(...rows.map(r=>r.maximum));
 const pad=Math.max((top-bottom)*.1,1),low=bottom-pad,high=top+pad;
 const x=r=>65+(Date.parse(r.day)-start)/(end-start)*910,y=v=>295-(v-low)/(high-low)*265;
 el('rect',{x:65,y:30,width:910,height:265,class:'plot-background','data-plot-background':''});
 for(let i=0;i<=5;i++){const t=low+(high-low)*i/5;el('line',{x1:65,x2:975,y1:y(t),y2:y(t),stroke:'var(--line)'});el('text',{x:55,y:y(t)+5,fill:'var(--muted)','font-size':13,'text-anchor':'end'},fmt(t))}
 for(let i=0;i<=5;i++){const stamp=start+(end-start-86400000)*i/5;el('text',{x:65+i*910/5,y:330,fill:'var(--muted)','font-size':13,'text-anchor':i===5?'end':'start'},new Date(stamp).toLocaleDateString('de-CH',{day:'2-digit',month:'2-digit',year:'2-digit',timeZone:'UTC'}))}
 el('text',{x:14,y:160,transform:'rotate(-90 14 160)',fill:'var(--muted)','font-size':13,'text-anchor':'middle'},data.unit==='°C'?'° Celsius':data.unit||data.label);
 const main=data.metric==='gust'?'maximum':'mean';
 for(const [key,color]of [['minimum','#6aa7ec'],['maximum','#e9a075'],['mean','var(--accent)']]){
  let path='',previousEnd=null;
  for(const r of rows){const stamp=Date.parse(r.day);path+=(previousEnd!==null&&stamp-previousEnd===86400000?'L':'M')+x(r)+','+y(r[key]);previousEnd=Date.parse(r.end)}
  el('path',{d:path,fill:'none',stroke:color,'stroke-width':key===main?2.5:1,opacity:key===main?1:.55});
 }
 for(const r of rows){const c=el('circle',{cx:x(r),cy:y(r[main]),r:rows.length<3?4:7,fill:rows.length<3?'var(--accent)':'transparent',tabindex:0,role:'button','aria-label':r.day+': '+fmt(r[main])+' '+data.unit});
 const show=()=>$('hint').textContent=`${r.period}${r.partial?' (Teilzeitraum)':''} · Mittel ${fmt(r.mean)} ${data.unit} · Min ${fmt(r.minimum)} · Max ${fmt(r.maximum)} · ${r.valid_samples} gültige Werte von ${r.samples} · Messwerte an ${r.days_with_values}/${r.calendar_days} Kalendertagen`;
 c.onpointerenter=show;c.onclick=show;c.onfocus=show;
 }
}
$('year').onchange=e=>load(e.target.value);
$('resolution').onchange=()=>loadSeries();$('metric').onchange=()=>loadSeries();$('apply').onclick=()=>loadSeries();

load();
