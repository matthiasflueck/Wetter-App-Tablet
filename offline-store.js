/* One active record in one IndexedDB transaction: never replace a good partial download. */
window.WeatherOffline={
  open(){return new Promise((resolve,reject)=>{const request=indexedDB.open('wetter-tablet',1);request.onupgradeneeded=()=>request.result.createObjectStore('records');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Offline-Speicher nicht verfügbar'));request.onblocked=()=>reject(Error('Bitte andere Wetter-App-Fenster schliessen'))})},
  async read(){const db=await this.open();try{return await new Promise((resolve,reject)=>{const request=db.transaction('records').objectStore('records').get('active');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(Error('Gespeicherte Daten konnten nicht gelesen werden'))})}finally{db.close()}},
  async activate(record){const db=await this.open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('records','readwrite');tx.objectStore('records').put(record,'active');tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('Offline-Speicherung fehlgeschlagen; bisheriger Stand bleibt erhalten'))})}finally{db.close()}}
};
