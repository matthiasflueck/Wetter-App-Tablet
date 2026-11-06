
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
  if(!response.ok)throw Error('Bitte zuerst unter Daten & Synchronisation Messdaten herunterladen.');
  const d=await response.json();
  if(!$('year').options.length)for(const y of d.years)$('year').add(new Option(y,y));
  $('year').value=d.year;
  $('start').value=d.year+'-01-01';$('end').value=d.year+'-12-31';
  $('meta').textContent=`Datenversion ${d.report.version} · ${fmt(d.report.valid_rows)} Messungen insgesamt · Europe/Zurich`;
  await loadSeries();
 }catch(e){$('error').textContent=e.message}
}
async function loadSeries(){return window.WeatherAnalysis.load()}
$('year').onchange=e=>load(e.target.value);
$('resolution').onchange=()=>loadSeries();$('metric').onchange=()=>loadSeries();$('apply').onclick=()=>loadSeries();


load();
