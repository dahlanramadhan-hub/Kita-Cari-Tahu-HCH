
const LOGO_DATA='/assets/images/logo.png';
const users={divisi:"humasjabar"};
let currentUser=null;
let contents=[];


function normalizeData(){
  contents.forEach(c=>{
    if(!Array.isArray(c.channel)){
      c.channel=String(c.channel||"").split(",").map(x=>x.trim()).filter(Boolean);
    }
    c.materials=c.materials||[];c.requesterName=c.requesterName||"";
    c.drafts=c.drafts||[];c.drafts.forEach(d=>{d.type=d.type||"file";d.comments=d.comments||[];});
    c.comments=c.comments||[];
    c.referenceFiles=c.referenceFiles||[];
    c.caption=c.caption||"";
    c.captionComments=c.captionComments||[];
    if(!Array.isArray(c.captionRevisions)){
      c.captionRevisions=(Array.isArray(c.captionVersions)&&c.captionVersions.length)
        ? c.captionVersions.map(v=>({text:v.text||"",date:v.date||"",comments:v.comments||[]}))
        : (c.caption?[{text:c.caption,date:"Caption sebelumnya",comments:c.captionComments}]:[]);
    }
    c.captionApproved=!!c.captionApproved;
    c.final=c.final||null;
  });
}


function normalizeResponsible(){
  contents.forEach(c=>{c.responsibleName=c.responsibleName||"";});
}

function esc(s){return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]))}
function badge(s){let c=s==="Approved"||s==="Publish"?"b-green":s==="Revisi"?"b-yellow":s==="Publish Terjadwal"?"b-purple":"b-gray";return `<span class="badge ${c}">${esc(s)}</span>`}
function canEdit(){return true;}
function isFinalLocked(c){return !!(c&&c.captionApproved&&(c.drafts||[]).some(d=>d.finalApproved));}
function ensureEditable(c){if(isFinalLocked(c)){alert("Proyek ini sudah FINAL karena Draft/Revisi dan Caption telah sama-sama di-ACC. Seluruh perubahan dan pengiriman baru dikunci.");return false;}return true;}
function fileToDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});}
function previewItem(id,kind,index){const c=contents.find(x=>x.id===id),f=(kind==="material"?c?.materials:c?.referenceFiles)?.[index];if(!f)return;if(f.kind==="link"){window.open(f.text||f.name,"_blank","noopener");return;}if(f.kind==="text"){alert((f.name||"Isi teks")+":\\n\\n"+(f.text||""));return;}if(!f.dataUrl&&!f.fileUrl){alert("File belum tersedia di server.");return;}const w=window.open();if(!w){alert("Izinkan pop-up browser untuk melihat pratinjau.");return;}const fileSrc=f.fileUrl||f.dataUrl;if((f.mime||"").startsWith("image/"))w.document.write(`<title>${esc(f.name)}</title><img src="${fileSrc}" style="max-width:100%;height:auto">`);else if((f.mime||"").startsWith("video/"))w.document.write(`<title>${esc(f.name)}</title><video src="${fileSrc}" controls style="max-width:100%"></video>`);else w.location.href=fileSrc;}
function downloadFileRecord(f) {
  if (!f) { alert("File tidak ditemukan."); return; }
  if (f.kind === "link" || f.type === "link") {
    const url = f.text || f.fileUrl || f.name;
    if (url) window.open(url, "_blank", "noopener");
    else alert("Tautan tidak ditemukan.");
    return;
  }
  if (f.kind === "text" || f.type === "text") {
    alert((f.name || "Isi teks") + ":\n\n" + (f.text || ""));
    return;
  }
  const fileUrl = f.fileUrl || f.dataUrl;
  if (!fileUrl) {
    alert("File asli tidak ditemukan. File mungkin belum tersimpan atau belum selesai diunggah ke server.");
    return;
  }
  const a = document.createElement("a");
  a.href = fileUrl;
  a.download = f.name || "file";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function downloadItem(id, kind, index) {
  const c = contents.find(x => x.id === id);
  if (!c) { alert("Data konten tidak ditemukan."); return; }
  let files;
  if (kind === "material") files = c.materials;
  else if (kind === "draft") files = c.drafts;
  else if (kind === "reference") files = c.referenceFiles;
  else { alert("Kategori file tidak dikenali."); return; }
  downloadFileRecord(files?.[index]);
}
function downloadAllItems(id,kind){const c=contents.find(x=>x.id===id),list=kind==="material"?(c?.materials||[]):(c?.referenceFiles||[]);list.forEach((f,i)=>{if(f.kind==="file")downloadItem(id,kind,i);});}

let accounts = [];
let currentAccount=null;
let csrfToken="";
let contentSaveTimer=null;
let contentSaveInFlight=false;
let contentSavePending=false;

async function apiRequest(path, options={}){
  const headers={"Accept":"application/json",...(options.headers||{})};
  if(options.body && !(options.body instanceof FormData)) headers["Content-Type"]="application/json";
  if(csrfToken && options.method && options.method!=="GET") headers["X-CSRF-Token"]=csrfToken;
  const response=await fetch(`/api/${path}`,{credentials:"same-origin",...options,headers});
  const data=await response.json().catch(()=>({message:"Respons server tidak valid."}));
  if(!response.ok) throw new Error(data.message||"Permintaan gagal.");
  if(data.csrf) csrfToken=data.csrf;
  return data;
}
function mergeUploadedFileRefs(localValue,savedValue){
  if(!localValue||!savedValue||typeof localValue!=="object"||typeof savedValue!=="object")return;
  if(savedValue.fileUrl&&savedValue.fileId){
    localValue.fileUrl=savedValue.fileUrl;
    localValue.fileId=savedValue.fileId;
    delete localValue.dataUrl;
    return;
  }
  if(Array.isArray(localValue)&&Array.isArray(savedValue)){
    for(let i=0;i<Math.min(localValue.length,savedValue.length);i++)mergeUploadedFileRefs(localValue[i],savedValue[i]);
    return;
  }
  if(!Array.isArray(localValue)&&!Array.isArray(savedValue)){
    Object.keys(savedValue).forEach(key=>{
      if(Object.prototype.hasOwnProperty.call(localValue,key))mergeUploadedFileRefs(localValue[key],savedValue[key]);
    });
  }
}
function scheduleContentSave(){
  if(!currentAccount)return;
  clearTimeout(contentSaveTimer);
  contentSaveTimer=setTimeout(saveContentsToServer,700);
}
async function saveContentsToServer(){
  if(!currentAccount)return;
  if(contentSaveInFlight){contentSavePending=true;return;}
  contentSaveInFlight=true;
  try{
    const result=await apiRequest("contents",{method:"POST",body:JSON.stringify({contents})});
    if(Array.isArray(result.contents)){
      const savedById=new Map(result.contents.map(item=>[String(item.id),item]));
      contents.forEach(item=>{
        const saved=savedById.get(String(item.id));
        if(saved)mergeUploadedFileRefs(item,saved);
      });
    }
  }catch(error){
    console.error(error);
    alert("Perubahan belum tersimpan ke server: "+error.message+"\\nPeriksa koneksi dan konfigurasi database.");
  }finally{
    contentSaveInFlight=false;
    if(contentSavePending){contentSavePending=false;saveContentsToServer();}
  }
}
async function persistAccounts(){
  try{
    const data=await apiRequest("accounts",{method:"POST",body:JSON.stringify({accounts})});
    accounts=data.accounts||accounts;
    if(currentAccount){currentAccount=accounts.find(a=>a.id===currentAccount.id)||currentAccount;}
  }catch(error){alert("Akun gagal disimpan: "+error.message);}
}
async function initializeApp(){
  try{
    const data=await apiRequest("bootstrap");
    csrfToken=data.csrf||"";
    if(data.authenticated){
      currentAccount=data.user;
      currentUser=currentAccount.name;
      accounts=data.accounts||[];
      contents=data.contents||[];
      render();
    }else login();
  }catch(error){
    console.error(error);
    login();
    alert("Tidak dapat terhubung ke server. Pastikan database sudah dikonfigurasi.");
  }
}
function isSuper(){return currentAccount?.role==="Super Admin"}
function isAdmin(){return currentAccount?.role==="Admin"}
function isEditor(){return currentAccount?.role==="Editor"}
function canManageAccounts(){return isSuper()||isAdmin()}
function canSubmitContent(){return isSuper()||isAdmin()}
function canApprove(){return isSuper()||isAdmin()}
function canEdit(){return canSubmitContent()}
function login(){
document.getElementById("app").innerHTML=`<div class="login"><div class="login-card">
<div class="login-brand"><img src="${LOGO_DATA}" alt="Disnakertrans Provinsi Jawa Barat"></div>
<div class="eyebrow">PUSAT PUBLIKASI HUMAS</div><h1>Humas Content Hub</h1>
<p>Masuk sesuai akun dan hak akses Anda.</p><div class="form">
<label>Username</label><input id="username" autocomplete="username" placeholder="Masukkan username Anda" onkeydown="if(event.key==='Enter')doLogin()">
<label>Password</label><div class="password-field"><input id="password" type="password" autocomplete="current-password" placeholder="Masukkan password Anda" onkeydown="if(event.key==='Enter')doLogin()"><button type="button" class="password-toggle" aria-label="Tampilkan password" title="Tampilkan password" onclick="togglePasswordVisibility('password',this)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg></button></div>
<button class="btn primary" style="width:100%;margin-top:10px" onclick="doLogin()">Masuk ke Content Hub</button>
</div><div class="demo"><b>Informasi akses:</b><br>Gunakan username dan password yang diberikan oleh Super Admin. Untuk keamanan, jangan membagikan kredensial akun.</div>
</div></div>`;
}
async function doLogin(){
 const u=document.getElementById("username").value.trim().toLowerCase();
 const p=document.getElementById("password").value;
 try{
   const data=await apiRequest("login",{method:"POST",body:JSON.stringify({username:u,password:p})});
   currentAccount=data.user;currentUser=currentAccount.name;
   accounts=data.accounts||[];
   contents=data.contents||[];
   render();
 }catch(error){alert(error.message||"Username atau password salah.");}
}

function openAccountManagement(){
 if(!canManageAccounts()){openMyAccount();return;}
 const visibleAccounts=accounts.filter(a=>isSuper()||a.role!=="Super Admin");
 const rows=visibleAccounts.map(a=>`<tr><td><b>${esc(a.name)}</b><br><small>${esc(a.username)}</small></td><td>${esc(a.role)}</td>${isSuper()?`<td><span id="account-password-${a.id}">••••••••</span> <button class="btn secondary" style="padding:6px 9px;font-size:11px" onclick="toggleAccountPassword(${a.id},this)">Lihat</button></td>`:""}<td><button class="btn secondary" onclick="editAccount(${a.id})">Edit</button> ${a.id===currentAccount.id?'<span class="file-size">Akun aktif</span>':`<button class="btn danger" onclick="deleteAccount(${a.id})">Hapus</button>`}</td></tr>`).join("");
 show(`<div class="modal account-modal"><div class="modal-head"><div><div class="eyebrow">PENGATURAN</div><h2 style="margin:5px 0">Kelola Akun</h2><div class="meta">Atur akun Admin dan Editor.</div></div><button class="close" onclick="closeModal()">×</button></div><div class="modal-body"><div class="actions" style="margin:0 0 15px"><button class="btn primary" onclick="addAccount()">＋ Tambah Akun</button></div><div style="overflow:auto"><table class="account-table"><thead><tr><th>Nama / Username</th><th>Role</th>${isSuper()?"<th>Password</th>":""}<th>Aksi</th></tr></thead><tbody>${rows}</tbody></table></div><p class="item-note">Akun Super Admin hanya satu, tidak dapat dihapus, dan hanya nama, username, serta password yang dapat diubah.</p>${isSuper()?'<p class="item-note" style="color:#a16207">Mode prototype: Super Admin dapat melihat password akun karena disimpan lokal sebagai teks biasa. Jangan gunakan cara ini pada aplikasi produksi.</p>':""}</div></div>`);
}
function toggleAccountPassword(id,button){
 alert("Password disimpan dalam bentuk hash dan tidak dapat ditampilkan. Gunakan fitur Edit Akun untuk mengganti password.");
}

function openMyAccount(){
 const a=currentAccount;
 show(`<div class="modal" style="max-width:500px"><div class="modal-head"><h2>Informasi Akun Saya</h2><button class="close" onclick="closeModal()">×</button></div><div class="modal-body"><div class="form"><div class="form-group"><label>Nama Lengkap</label><input id="myName" value="${esc(a.name)}" placeholder="Masukkan nama lengkap Anda"></div><div class="form-group"><label>Username</label><input id="myUsername" value="${esc(a.username)}" placeholder="Masukkan username Anda"></div><div class="form-group"><label>Password Baru</label><div class="password-field"><input id="myPassword" type="password" placeholder="Masukkan password baru (opsional)"><button type="button" class="password-toggle" aria-label="Tampilkan password" title="Tampilkan password" onclick="togglePasswordVisibility('myPassword',this)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg></button></div></div><button class="btn primary" onclick="saveMyAccount()">Simpan Perubahan</button></div></div></div>`);
}
async function saveMyAccount(){
 const name=document.getElementById("myName").value.trim(),username=document.getElementById("myUsername").value.trim(),password=document.getElementById("myPassword").value;
 if(!name||!username){alert("Nama dan username wajib diisi.");return}
 try{
   const data=await apiRequest("profile",{method:"POST",body:JSON.stringify({name,username,password})});
   currentAccount=data.user;currentUser=name;
   accounts=accounts.map(a=>a.id===currentAccount.id?currentAccount:a);
   closeModal();render();
 }catch(error){alert(error.message);}
}

function accountForm(id=null){
 const a=id?accounts.find(x=>x.id===id):null;
 if(a?.role==="Super Admin"&&!isSuper()){alert("Admin tidak dapat mengubah akun Super Admin.");return}
 const roleField=a?.role==="Super Admin"?`<div class="form-group"><label>Role</label><input value="Super Admin" disabled></div>`:`<div class="form-group"><label>Role</label><select id="accountRole"><option ${a?.role==="Admin"?"selected":""}>Admin</option><option ${a?.role==="Editor"||!a?"selected":""}>Editor</option></select></div>`;
 show(`<div class="modal" style="max-width:500px"><div class="modal-head"><h2>${a?"Edit Akun":"Tambah Akun"}</h2><button class="close" onclick="closeModal()">×</button></div><div class="modal-body"><div class="form"><div class="form-group"><label>Nama Lengkap</label><input id="accountName" value="${esc(a?.name||"")}" placeholder="Masukkan nama lengkap"></div><div class="form-group"><label>Username</label><input id="accountUsername" value="${esc(a?.username||"")}" placeholder="Masukkan username"></div><div class="form-group"><label>Password ${a?"(kosongkan jika tidak diubah)":""}</label><div class="password-field"><input id="accountPassword" type="password" placeholder="Masukkan password akun"><button type="button" class="password-toggle" aria-label="Tampilkan password" title="Tampilkan password" onclick="togglePasswordVisibility('accountPassword',this)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg></button></div></div>${roleField}<button class="btn primary" onclick="saveAccount(${id===null?"null":id})">Simpan Akun</button></div></div></div>`);
}
function addAccount(){accountForm()}
function editAccount(id){accountForm(id)}
function saveAccount(id){
 const name=document.getElementById("accountName").value.trim(),username=document.getElementById("accountUsername").value.trim(),password=document.getElementById("accountPassword").value;
 const old=id===null?null:accounts.find(a=>a.id===id),role=old?old.role:document.getElementById("accountRole").value;
 if(!name||!username||(!old&&!password)){alert("Lengkapi nama, username, dan password.");return}
 if(accounts.some(a=>a.username.toLowerCase()===username.toLowerCase()&&a.id!==id)){alert("Username sudah digunakan.");return}
 if(old?.role==="Super Admin"&&!isSuper()){alert("Admin tidak dapat mengubah akun Super Admin.");return}
 if(old){old.name=name;old.username=username;if(password)old.password=password;}
 else{if(role==="Super Admin"||accounts.some(a=>a.role==="Super Admin"&&role==="Super Admin")){alert("Akun baru hanya dapat dibuat sebagai Admin atau Editor.");return}accounts.push({id:Math.max(0,...accounts.map(a=>a.id))+1,name,username,password,role});}
 persistAccounts();closeModal();openAccountManagement();
}
function deleteAccount(id){
 const a=accounts.find(x=>x.id===id);if(!a)return;
 if(a.role==="Super Admin"){alert("Akun Super Admin tidak dapat dihapus.");return}
 if(a.id===currentAccount.id){alert("Akun yang sedang digunakan tidak dapat dihapus.");return}
 if(!confirm("Hapus akun "+a.name+"?"))return;
 accounts=accounts.filter(x=>x.id!==id);persistAccounts();openAccountManagement();
}
function render(){normalizeData();normalizeResponsible();
document.getElementById("app").innerHTML=`<header class="topbar"><div class="brand"><img class="brand-logo" src="${LOGO_DATA}" alt="Disnakertrans Provinsi Jawa Barat"><div class="brand-copy"><strong>Humas Content Hub</strong><small>DISNAKERTRANS PROVINSI JAWA BARAT</small></div></div><div class="userbox"><div class="account-profile"><span class="account-avatar"><img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxNjAgMTYwIj4KPGRlZnM+PGxpbmVhckdyYWRpZW50IGlkPSJnIiB4MT0iMCIgeTE9IjAiIHgyPSIxIiB5Mj0iMSI+PHN0b3Agc3RvcC1jb2xvcj0iIzAwNjhhZiIvPjxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iIzAwODEwYiIvPjwvbGluZWFyR3JhZGllbnQ+PC9kZWZzPgo8cmVjdCB3aWR0aD0iMTYwIiBoZWlnaHQ9IjE2MCIgcng9IjgwIiBmaWxsPSJ1cmwoI2cpIi8+CjxjaXJjbGUgY3g9IjgwIiBjeT0iNjIiIHI9IjMxIiBmaWxsPSIjZDlhMjdlIi8+CjxwYXRoIGQ9Ik00OCA1OGMzLTMwIDIwLTQ0IDM0LTQ0IDIyIDAgMzUgMTcgMzQgNDItMTAtOC0xOS0xMi0zMS0xMi0xMyAwLTI1IDYtMzcgMTR6IiBmaWxsPSIjMjYzMjM4Ii8+CjxwYXRoIGQ9Ik00OCAxMzdjNS0yOSAxOC00MyAzMi00M3MyNyAxNCAzMiA0MyIgZmlsbD0iI2ZmZiIvPgo8cGF0aCBkPSJNNjIgNzVjNSA0IDEwIDYgMTggNnMxMy0yIDE4LTYiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzZiM2YzMiIgc3Ryb2tlLXdpZHRoPSI0IiBzdHJva2UtbGluZWNhcD0icm91bmQiLz4KPGNpcmNsZSBjeD0iNjgiIGN5PSI2MiIgcj0iMyIgZmlsbD0iIzI2MzIzOCIvPjxjaXJjbGUgY3g9IjkyIiBjeT0iNjIiIHI9IjMiIGZpbGw9IiMyNjMyMzgiLz4KPC9zdmc+" alt="Foto profil Dahlan Ramadhan"></span><div class="account-info"><div class="account-name">${esc(currentAccount?.name||"Pengguna")}</div><div class="account-role">${esc(currentAccount?.role||"")}</div></div></div><div class="account-tools"><button class="btn ghost" onclick="openAccountManagement()">Kelola Akun</button><button class="btn ghost" onclick="logout()">Keluar</button></div></div></header>
<main class="container"><div class="hero"><img class="hero-logo" src="${LOGO_DATA}" alt=""><div><div class="eyebrow">PUSAT PUBLIKASI HUMAS</div><h1>Kelola konten tanpa ribet.</h1><p>Semua proses publikasi dalam satu tempat — dari pengajuan sampai tayang.</p></div>${canEdit()?'<button class="btn primary" onclick="openNew()">＋ Ajukan Konten</button>':''}</div>
<div class="stats" id="stats"></div>
<div class="toolbar"><button class="filter" onclick="filterCards('Semua')">Semua</button><button class="filter" onclick="filterCards('Belum Dikerjakan')">Belum Dikerjakan</button><button class="filter" onclick="filterCards('Revisi')">Revisi</button><button class="filter" onclick="filterCards('Selesai')">Selesai</button></div>
<div id="cards" class="grid"></div></main><footer class="site-footer"><div class="footer-brand"><div><b>Humas Content Hub</b><span>Disnakertrans Provinsi Jawa Barat</span></div></div><div><span>Alur: Ajukan · Revisi · ACC · Final · Publish</span><span>© 2026 Humas</span></div></footer>`;
renderStats();renderCards();
 document.querySelectorAll('.toolbar .filter').forEach((btn,i)=>{
   const selected=i===0;btn.classList.toggle('active',selected);btn.setAttribute('aria-pressed',selected?'true':'false');
 });
}
function isCompletedStatus(status){
 return ["Approved","Publish Terjadwal","Publish"].includes(status);
}
function dashboardStatus(status){
 return isCompletedStatus(status)?"Selesai":status;
}
function renderStats(){
 let counts={
   pending:contents.filter(x=>x.status==="Belum Dikerjakan").length,
   revisi:contents.filter(x=>x.status==="Revisi").length,
   selesai:contents.filter(x=>isCompletedStatus(x.status)).length
 };
 document.getElementById("stats").innerHTML=`
 <div class="stat stat-pending"><div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8.5h16a4 4 0 0 1 4 4v28H12v-28a4 4 0 0 1 4-4Z"/><path d="M19 8.5V6h10v2.5"/><path d="m17.5 19 2.2 2.2 3.4-3.6M26 19.5h6.5"/><path d="m17.5 28 2.2 2.2 3.4-3.6M26 28.5h6.5"/></svg></div><b>${counts.pending}</b><span>Belum Dikerjakan</span></div>
 <div class="stat stat-revision"><div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><path d="M37 17a15 15 0 0 0-26-5"/><path d="M11 6v7h7"/><path d="M11 31a15 15 0 0 0 26 5"/><path d="M37 42v-7h-7"/></svg></div><b>${counts.revisi}</b><span>Revisi</span></div>
 <div class="stat stat-done"><div class="stat-icon" aria-hidden="true"><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="24" cy="24" r="16"/><path d="m16.5 24.5 5 5 10.5-11"/></svg></div><b>${counts.selesai}</b><span>Selesai</span></div>`;
}
let activeFilter="Semua";
function filterCards(f){
 activeFilter=f;
 document.querySelectorAll('.toolbar .filter').forEach(btn=>{
   const label=btn.textContent.trim();
   btn.classList.toggle('active',label===f);
   btn.setAttribute('aria-pressed',label===f?'true':'false');
 });
 renderCards();
}

function socialPlatformIcon(name){
 const n=String(name||"").toLowerCase();
 if(n==="instagram") return `<svg class="social-platform-mark instagram-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2"/><circle cx="12" cy="12" r="4.2"/><circle cx="17.7" cy="6.5" r="1" class="mark-dot"/></svg>`;
 if(n==="tiktok") return `<svg class="social-platform-mark tiktok-mark" viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.1a4.2 4.2 0 1 1-3.4-4.1"/><path d="M14 3c.4 2.7 2 4.4 4.8 4.8"/></svg>`;
 return "";
}
function uniqueSocialPlatforms(channels){
 const raw=Array.isArray(channels)?channels:String(channels||"").split(/[·,]/);
 const seen=new Set();
 return raw.map(x=>String(x||"").trim()).filter(name=>{
   if(!name)return false;
   const key=name.toLocaleLowerCase("id-ID");
   if(seen.has(key))return false;
   seen.add(key);
   return true;
 });
}
function socialPlatformBadges(channels){
 const items=uniqueSocialPlatforms(channels);
 return `<span class="social-platform-badges">${items.map(name=>`<span class="social-platform-chip">${socialPlatformIcon(name)}<span>${esc(name)}</span></span>`).join("")}</span>`;
}

function renderCards(){
let arr=activeFilter==="Semua"?contents:activeFilter==="Selesai"?contents.filter(x=>isCompletedStatus(x.status)):contents.filter(x=>x.status===activeFilter);
document.getElementById("cards").innerHTML=arr.length?arr.map(c=>`<article class="card card-status-${isCompletedStatus(c.status)?"done":c.status==="Revisi"?"revision":"pending"}"><div class="card-head"><div><h3>${esc(c.title)}</h3><div class="meta"><span>${esc(c.type)}</span><span>•</span><span>${esc(uniqueSocialPlatforms(c.channel).join(" · "))}</span><span>•</span><span>Rasio ${esc(c.ratio||"1:1")}</span></div></div>${badge(dashboardStatus(c.status))}</div>
<div class="deadline"><b>Deadline:</b> ${esc(c.deadline)}</div>
<div class="card-highlights">
  <span class="card-highlight social-highlight">${socialPlatformBadges(c.channel)}</span>
  ${c.responsibleName?`<span class="card-highlight pic-highlight"><span class="mini-avatar">${esc(c.responsibleName.split(/\s+/).slice(0,2).map(x=>x[0]).join("").toUpperCase())}</span> 👤 ${esc(c.responsibleName)}</span>`:""}${c.requesterName?`<span class="card-highlight requester-highlight">📝 Pengaju: ${esc(c.requesterName)}</span>`:""}
</div>
<div class="meta" style="margin-top:10px"><span>📎 ${c.materials.length} bahan</span><span>📝 ${c.drafts.length} draft</span>${c.final?'<span>✅ Final tersedia</span>':''}</div>
<div class="actions"><button class="btn primary" onclick="openDetail(${c.id})">Lihat Detail</button>${c.caption&&c.captionApproved?`<button class="btn secondary" onclick="copyCaption(${c.id})">⧉ Copy Caption</button>`:''}${c.final&&c.drafts?.some(d=>d.finalApproved)?`<button class="btn secondary" onclick="downloadFinal(${c.id})">↓ Download Final</button>`:''}</div></article>`).join(""):`<div class="empty">Tidak ada konten pada status ini.</div>`;
  scheduleContentSave();
}
function eligiblePJAccounts(){return accounts.filter(a=>["Admin","Editor"].includes(String(a.role||""))&&String(a.username||"").trim()).sort((a,b)=>String(a.username).localeCompare(String(b.username),"id"));}
function pjOptions(selected=""){
 const list=eligiblePJAccounts();
 if(selected&&!list.some(a=>a.username===selected))return `<option value="${esc(selected)}" selected>${esc(selected)} (akun tidak lagi terdaftar)</option>`+list.map(a=>`<option value="${esc(a.username)}">${esc(a.username)}</option>`).join("");
 return `<option value="">Pilih username PJ Proyek</option>`+list.map(a=>`<option value="${esc(a.username)}" ${a.username===selected?"selected":""}>${esc(a.username)}</option>`).join("");
}
// Custom dropdown PJ Proyek: daftar hanya berisi username, tanpa placeholder berulang.
function pjPersonIcon(){
 return '<svg class="hch-pj-person-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="7.5" r="4"/><path d="M4 21c.4-4.3 3.1-6.5 8-6.5s7.6 2.2 8 6.5"/></svg>';
}
function pjDropdown(id, selected="", disabled=false){
 const list=eligiblePJAccounts();
 if(selected&&!list.some(a=>a.username===selected))list.unshift({username:selected,role:"Akun sebelumnya"});
 const selectedLabel=selected||"Pilih username PJ Proyek";
 const personIcon="";
 const checkIcon="";
 return `<div class="hch-pj-wrap ${disabled?"is-disabled":""}" data-pj-wrap="${esc(id)}">
   <select id="${esc(id)}" class="pj-native-select" ${disabled?"disabled":""} ${id==="nResponsible"?"required":""}>${pjOptions(selected)}</select>
   <button type="button" class="hch-pj-trigger" aria-haspopup="listbox" aria-expanded="false" ${disabled?"disabled":""} onclick="togglePJDropdown('${esc(id)}',event)">
    <span class="hch-pj-label ${selected?"has-value":""}">${esc(selectedLabel)}</span>
   </button>
   <div class="hch-pj-menu" role="listbox" aria-label="Username PJ Proyek">
    ${list.map(a=>`<button type="button" class="hch-pj-option ${a.username===selected?"is-selected":""}" role="option" aria-selected="${a.username===selected}" onclick="choosePJOption(${esc(JSON.stringify(id))},${esc(JSON.stringify(a.username))},event)">
      <span class="hch-pj-option-label">${esc(a.username)}</span>${a.username===selected?checkIcon:""}
    </button>`).join("")}
   </div>
  </div>`;
}
function togglePJDropdown(id,event){
 event?.stopPropagation();const wrap=document.querySelector(`[data-pj-wrap="${CSS.escape(id)}"]`);if(!wrap||wrap.classList.contains("is-disabled"))return;
 document.querySelectorAll(".hch-pj-wrap.is-open").forEach(x=>{if(x!==wrap){x.classList.remove("is-open");x.querySelector(".hch-pj-trigger")?.setAttribute("aria-expanded","false");}});
 const open=wrap.classList.toggle("is-open");wrap.querySelector(".hch-pj-trigger")?.setAttribute("aria-expanded",String(open));
}
function choosePJOption(id,username,event){
 event?.stopPropagation();const select=document.getElementById(id),wrap=document.querySelector(`[data-pj-wrap="${CSS.escape(id)}"]`);if(!select||!wrap)return;
 select.value=username;select.dispatchEvent(new Event("change",{bubbles:true}));
 const label=wrap.querySelector(".hch-pj-label");if(label){label.textContent=username;label.classList.add("has-value");}
 wrap.querySelectorAll(".hch-pj-option").forEach(option=>{const active=option.querySelector(".hch-pj-option-label")?.textContent===username;option.classList.toggle("is-selected",active);option.setAttribute("aria-selected",String(active));option.querySelector(".hch-pj-selected-check")?.remove();if(active)option.insertAdjacentHTML("beforeend",'<svg class="hch-pj-selected-check" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="m5 12.5 4.5 4.5L19.5 7"/></svg>');});
 wrap.classList.remove("is-open");wrap.querySelector(".hch-pj-trigger")?.setAttribute("aria-expanded","false");
}
document.addEventListener("click",event=>{if(!event.target.closest(".hch-pj-wrap"))document.querySelectorAll(".hch-pj-wrap.is-open").forEach(w=>{w.classList.remove("is-open");w.querySelector(".hch-pj-trigger")?.setAttribute("aria-expanded","false");});});
function openNew(){if(!canSubmitContent()){alert("Editor tidak memiliki akses untuk mengajukan konten.");return;}
show(`<div class="modal modal-submit">
  <div class="modal-head submit-head">
    <div>
      <div class="submit-brand">Disnakertrans Jabar</div>
      <h2>Ajukan Konten</h2>
      <p>Isi informasi dasar dan upload file yang dibutuhkan.</p>
    </div>
    <button class="close submit-close" aria-label="Tutup" onclick="requestCloseNewContent()">×</button>
  </div>
  <div class="modal-body submit-body">
    <form class="form submit-form" onsubmit="submitContent(event)">
      <section class="section submit-info">
        <div class="submit-section-head">
          <span class="submit-section-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5h10l7 7V28H8z"/><path d="M18 3.5V11h7M12 16h9M12 21h9"/></svg>
          </span>
          <div><h4>Informasi Konten</h4><p>Lengkapi informasi dasar mengenai konten yang diajukan.</p></div>
        </div>
        <div class="submit-info-grid">
          <div class="form-group"><label for="nTitle">Nama / Judul Konten</label><input id="nTitle" required placeholder="Masukan nama / judul konten"></div>
          <div class="form-group"><label for="nRequester">Pengaju Konten (Username)</label><input id="nRequester" value="${esc(currentAccount?.username||'')}" readonly aria-readonly="true" required></div>
          <div class="form-group submit-brief"><label for="nBrief">Brief / Arahan</label><textarea id="nBrief" rows="5" placeholder="Jelaskan detail konten"></textarea></div>
          <div class="submit-right-fields">
            <div class="form-group"><label for="nResponsible">PJ Proyek (Username)</label>${pjDropdown("nResponsible")}</div>
            <div class="submit-deadline-social">
              <div class="form-group"><label for="nDeadline">Deadline Konten</label><input id="nDeadline" type="date" required aria-label="Pilih tanggal deadline" title="Pilih tanggal deadline"></div>
              <div class="form-group"><label>Media Sosial</label>
                <div class="submit-socials">
                  <label class="submit-social"><input type="checkbox" name="nSocial" value="Instagram"><svg class="social-brand-icon instagram-brand" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" stroke-width="1.9"/>
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/>
      <circle cx="17.7" cy="6.5" r="1.15" fill="currentColor"/>
    </svg> Instagram</label>
                  <label class="submit-social"><input type="checkbox" name="nSocial" value="TikTok"><svg class="social-brand-icon tiktok-brand" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14.2 3v11.1a4.2 4.2 0 1 1-3.4-4.1" fill="none" stroke="#111827" stroke-width="2.7" stroke-linecap="round" stroke-linejoin="round"/>
      <path d="M14.2 3c.4 2.7 2 4.4 4.8 4.8" fill="none" stroke="#111827" stroke-width="2.7" stroke-linecap="round"/>
      <path d="M14.2 3v11.1a4.2 4.2 0 1 1-3.4-4.1" fill="none" stroke="#25F4EE" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round" transform="translate(-.8 .5)"/>
      <path d="M14.2 3c.4 2.7 2 4.4 4.8 4.8" fill="none" stroke="#FE2C55" stroke-width="1.1" stroke-linecap="round" transform="translate(.8 .5)"/>
    </svg> TikTok</label>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="submit-hidden-fields" aria-hidden="true">
          <select id="nType"><option>Video</option><option>Grafis</option></select>
          <select id="nRatio"><option>1:1</option><option>4:5</option><option>9:16</option></select>
        </div>
      </section>

      <div class="submit-upload-grid">
        <section class="section submit-upload-card">
          <div class="submit-section-head">
            <span class="submit-section-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 20 9-9a5 5 0 0 0-7-7l-9 9a7 7 0 0 0 10 10l10-10"/></svg>
            </span>
            <div><h4>Referensi</h4><p>Referensi dapat berupa file, teks atau link</p></div>
          </div>
          <div class="submit-upload-content resource-mode-content">
            <input id="nReferenceCombined" type="hidden">
            <div class="input-tabs resource-input-tabs">
              <button type="button" class="input-tab active" onclick="switchInput('nr','file',this)">📎 File</button>
              <button type="button" class="input-tab" onclick="switchInput('nr','text',this)">✎ Teks</button>
              <button type="button" class="input-tab" onclick="switchInput('nr','link',this)">🔗 Link</button>
            </div>
            <div id="nr-file" class="input-panel active">
              <label class="submit-file-picker">
                <input id="nReferenceFile" type="file" multiple onchange="showSelected('nReferenceFile','newRefs')">
                <span class="submit-file-button"><span aria-hidden="true">↥</span> Pilih file</span>
                <span class="submit-file-names" id="newRefs">Belum ada file yang dipilih</span>
              </label>
            </div>
            <div id="nr-text" class="input-panel">
              <textarea id="nReferenceText" class="resource-textarea" rows="4" placeholder="Tulis informasi referensi di sini..."></textarea>
            </div>
            <div id="nr-link" class="input-panel">
              <input id="nReferenceLink" class="resource-link-input" type="url" placeholder="Masukkan tautan referensi (https://...)">
            </div>
          </div>
        </section>

        <section class="section submit-upload-card">
          <div class="submit-section-head">
            <span class="submit-section-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 8-9 9a5 5 0 0 0 7 7l10-10a7 7 0 0 0-10-10L6 14"/></svg>
            </span>
            <div><h4>Bahan / Footage</h4><p>Footage dapat berupa file, teks atau link</p></div>
          </div>
          <div class="submit-upload-content resource-mode-content">
            <input id="nMaterialCombined" type="hidden">
            <div class="input-tabs resource-input-tabs">
              <button type="button" class="input-tab active" onclick="switchInput('nm','file',this)">📎 File</button>
              <button type="button" class="input-tab" onclick="switchInput('nm','text',this)">✎ Teks</button>
              <button type="button" class="input-tab" onclick="switchInput('nm','link',this)">🔗 Link</button>
            </div>
            <div id="nm-file" class="input-panel active">
              <label class="submit-file-picker">
                <input id="nMaterials" type="file" multiple onchange="showSelected('nMaterials','newFiles')">
                <span class="submit-file-button"><span aria-hidden="true">↥</span> Pilih file</span>
                <span class="submit-file-names" id="newFiles">Belum ada file yang dipilih</span>
              </label>
            </div>
            <div id="nm-text" class="input-panel">
              <textarea id="nMaterialText" class="resource-textarea" rows="4" placeholder="Tulis informasi bahan / footage di sini..."></textarea>
            </div>
            <div id="nm-link" class="input-panel">
              <input id="nMaterialLink" class="resource-link-input" type="url" placeholder="Masukkan tautan bahan / footage (https://...)">
            </div>
          </div>
        </section>
      </div>

      <div class="actions submit-actions">
        <button type="button" class="btn ghost submit-cancel" onclick="closeModal()">Batal</button>
        <button class="btn primary submit-send"><span aria-hidden="true">➤</span> Ajukan Konten</button>
      </div>
    </form>
  </div>
</div>`);
 restoreNewContentDraft();
}
function syncSubmissionValue(group,value){
 const isUrl=/^(https?:\/\/|www\.)/i.test(value.trim());
 const textId=group==="material"?"nMaterialText":"nReferenceText";
 const linkId=group==="material"?"nMaterialLink":"nReferenceLink";
 const text=document.getElementById(textId),link=document.getElementById(linkId);
 if(text&&link){text.value=isUrl?"":value;link.value=isUrl?value:"";}
}

const NEW_CONTENT_DRAFT_KEY="hch_new_content_draft_v1";
function getNewContentFormData(){
 const val=id=>document.getElementById(id)?.value||"";
 return {
  title:val("nTitle"),requester:val("nRequester"),brief:val("nBrief"),
  responsible:val("nResponsible"),deadline:val("nDeadline"),
  reference:val("nReferenceCombined"),material:val("nMaterialCombined"),
  referenceText:val("nReferenceText"),referenceLink:val("nReferenceLink"),
  materialText:val("nMaterialText"),materialLink:val("nMaterialLink"),
  socials:[...document.querySelectorAll('input[name="nSocial"]:checked')].map(x=>x.value)
 };
}
function newContentHasChanges(){
 const f=document.querySelector(".modal-submit .submit-form");
 if(!f)return false;
 const d=getNewContentFormData();
 const hasValues=Object.entries(d).some(([k,v])=>Array.isArray(v)?v.length>0:String(v).trim()!=="");
 const hasFiles=["nReferenceFile","nMaterials"].some(id=>(document.getElementById(id)?.files?.length||0)>0);
 return hasValues||hasFiles;
}
function requestCloseNewContent(){
 if(!newContentHasChanges()){closeModal();return;}
 const old=document.getElementById("newContentCloseConfirm");if(old)old.remove();
 const popup=document.createElement("div");
 popup.id="newContentCloseConfirm";
 popup.className="confirm-center-backdrop";
 popup.innerHTML=`<div class="confirm-center-card new-content-close-card" role="dialog" aria-modal="true" aria-labelledby="newContentCloseTitle">
  <div class="confirm-center-icon" aria-hidden="true">!</div>
  <h3 id="newContentCloseTitle">Konten belum diajukan</h3>
  <p>Ada perubahan pada formulir ini. Apa yang ingin kamu lakukan sebelum keluar?</p>
  <div class="confirm-center-actions new-content-close-actions">
   <button class="confirm-save" type="button" onclick="saveNewContentDraftAndClose()">Simpan sebagai Draft</button>
   <button class="confirm-discard" type="button" onclick="discardNewContentAndClose()">Keluar Tanpa Menyimpan</button>
   <button class="confirm-cancel" type="button" onclick="document.getElementById('newContentCloseConfirm')?.remove()">Lanjut Mengisi</button>
  </div>
 </div>`;
 document.body.appendChild(popup);
}
async function saveNewContentDraftAndClose(){
 const formData=getNewContentFormData();
 try{
  const readFiles=async id=>{
   const files=[...(document.getElementById(id)?.files||[])];
   return Promise.all(files.map(async f=>({name:f.name,type:f.type,size:f.size,dataUrl:await fileToDataURL(f)})));
  };
  const draft={
   ...formData,
   referenceFiles:await readFiles("nReferenceFile"),
   materialFiles:await readFiles("nMaterials"),
   savedAt:new Date().toISOString()
  };
  sessionStorage.setItem(NEW_CONTENT_DRAFT_KEY,JSON.stringify(draft));
  document.getElementById("newContentCloseConfirm")?.remove();
  closeModal();
  alert("Draft pengajuan konten berhasil disimpan di browser ini. Kamu bisa melanjutkannya saat membuka Ajukan Konten kembali.");
 }catch(err){
  alert("Draft belum dapat disimpan. Penyimpanan browser mungkin penuh. Coba kurangi ukuran file atau keluar tanpa menyimpan.");
 }
}
function discardNewContentAndClose(){
 sessionStorage.removeItem(NEW_CONTENT_DRAFT_KEY);
 document.getElementById("newContentCloseConfirm")?.remove();
 closeModal();
}
function restoreNewContentDraft(){
 let draft;
 try{draft=JSON.parse(sessionStorage.getItem(NEW_CONTENT_DRAFT_KEY)||"null")}catch(e){draft=null}
 if(!draft)return;
 const set=(id,value)=>{const el=document.getElementById(id);if(el)el.value=value||""};
 set("nTitle",draft.title);set("nRequester",draft.requester);set("nBrief",draft.brief);
 set("nResponsible",draft.responsible);set("nDeadline",draft.deadline);
 set("nReferenceCombined",draft.reference);set("nMaterialCombined",draft.material);
 set("nReferenceText",draft.referenceText);set("nReferenceLink",draft.referenceLink);
 set("nMaterialText",draft.materialText);set("nMaterialLink",draft.materialLink);
 // Backward compatibility for local drafts saved before the three-tab input was introduced.
 if(!draft.referenceText&&!draft.referenceLink&&draft.reference)syncSubmissionValue("reference",draft.reference);
 if(!draft.materialText&&!draft.materialLink&&draft.material)syncSubmissionValue("material",draft.material);
 const activateSavedMode=(group,mode)=>{
   const panel=document.getElementById(group+"-"+mode);
   const tabs=panel?.parentElement?.querySelectorAll(".input-tab")||[];
   const panels=panel?.parentElement?.querySelectorAll(".input-panel")||[];
   panels.forEach(x=>x.classList.toggle("active",x===panel));
   tabs.forEach((x,i)=>x.classList.toggle("active",["file","text","link"][i]===mode));
 };
 if(draft.referenceText||draft.reference)activateSavedMode("nr","text");
 if(draft.referenceLink)activateSavedMode("nr","link");
 if(draft.materialText||draft.material)activateSavedMode("nm","text");
 if(draft.materialLink)activateSavedMode("nm","link");
 document.querySelectorAll('input[name="nSocial"]').forEach(el=>el.checked=(draft.socials||[]).includes(el.value));
 const restoreFiles=(id,items,target)=>{
  if(!items?.length)return;
  try{
   const dt=new DataTransfer();
   items.forEach(item=>{
    const parts=String(item.dataUrl||"").split(",");
    const mime=(parts[0].match(/data:(.*?);base64/)||[])[1]||item.type||"application/octet-stream";
    const binary=atob(parts[1]||"");
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    dt.items.add(new File([bytes],item.name,{type:mime}));
   });
   const input=document.getElementById(id);if(input)input.files=dt.files;
   const label=document.getElementById(target);
   if(label)label.textContent=items.map(x=>x.name).join(", ");
  }catch(e){/* Text draft remains available if browser blocks file restoration. */}
 };
 restoreFiles("nReferenceFile",draft.referenceFiles,"newRefs");
 restoreFiles("nMaterials",draft.materialFiles,"newFiles");
}

function showSelected(inputId,targetId){let files=[...document.getElementById(inputId).files];document.getElementById(targetId).innerHTML=files.map(f=>`<div class="file"><span class="file-name">📎 ${esc(f.name)}</span><span class="file-size">${formatSize(f.size)}</span></div>`).join("")}
function switchInput(group,type,btn){document.querySelectorAll(`[id^="${group}-"]`).forEach(el=>el.classList.remove("active"));document.getElementById(`${group}-${type}`).classList.add("active");btn.parentElement.querySelectorAll(".input-tab").forEach(x=>x.classList.remove("active"));btn.classList.add("active")}
async function submitContent(e){if(!canSubmitContent()){alert("Editor tidak memiliki akses untuk mengajukan konten.");return;}e.preventDefault();if(!document.getElementById("nResponsible").value.trim()){alert("Penanggung jawab konten wajib diisi.");return;}if(!document.getElementById("nRequester").value.trim()){alert("Nama pengaju konten wajib diisi.");return;}let socials=[...document.querySelectorAll('input[name="nSocial"]:checked')].map(x=>x.value);if(!socials.length){alert("Pilih minimal satu media sosial.");return}let d=document.getElementById("nDeadline").value;
let files=[];for(const f of [...document.getElementById("nMaterials").files])files.push({kind:"file",name:f.name,size:formatSize(f.size),type:fileType(f.name),mime:f.type,dataUrl:await fileToDataURL(f)});let mt=document.getElementById("nMaterialText").value.trim(),ml=document.getElementById("nMaterialLink").value.trim();if(mt)files.push({kind:"text",name:"Bahan / Footage (Teks)",text:mt,size:"Teks",type:"text"});if(ml)files.push({kind:"link",name:ml,text:ml,size:"Link",type:"link"});
let refs=[];for(const f of [...document.getElementById("nReferenceFile").files])refs.push({kind:"file",name:f.name,size:formatSize(f.size),type:fileType(f.name),mime:f.type,dataUrl:await fileToDataURL(f)});let rt=document.getElementById("nReferenceText").value.trim(),rl=document.getElementById("nReferenceLink").value.trim();if(rt)refs.push({kind:"text",name:"Referensi (Teks)",text:rt,size:"Teks",type:"text"});if(rl)refs.push({kind:"link",name:rl,text:rl,size:"Link",type:"link"});
contents.unshift({id:Date.now(),requesterName:currentAccount?.username||"",responsibleName:document.getElementById("nResponsible").value,title:document.getElementById("nTitle").value,type:document.getElementById("nType").value,ratio:document.getElementById("nRatio").value,channel:[...document.querySelectorAll('input[name="nSocial"]:checked')].map(x=>x.value),status:"Belum Dikerjakan",created:new Date().toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}),deadline:d?new Date(d+"T00:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"}):"-",deadlineISO:d,brief:document.getElementById("nBrief").value,materials:files,referenceLink:"",referenceFiles:refs,drafts:[],comments:[],caption:"",final:null,publishDate:"",publishTime:""});sessionStorage.removeItem(NEW_CONTENT_DRAFT_KEY);closeModal();renderStats();renderCards();alert("Konten berhasil diajukan.");}
let detailOriginalSnapshot=null;
function captureDetailForm(id){
 const c=contents.find(x=>String(x.id)===String(id));if(!c)return;
 const captionField=document.getElementById("captionEdit"+id);
 if(captionField&&!c.captionApproved){
  const latest=(c.captionRevisions||[]).slice(-1)[0]?.text||"";
  if(captionField.value.trim()!==latest)return true;
 }
 const get=name=>document.getElementById(name+id);
 for(const [el,key] of [["edTitle","title"],["edType","type"],["edRatio","ratio"],["edBrief","brief"],["edResponsible","responsibleName"]])if(get(el))c[key]=get(el).value;
 const socials=[...document.querySelectorAll('input[name="edSocial'+id+'"]:checked')].map(x=>x.value);if(socials.length)c.channel=socials;
 if(get("edDeadline")){const d=get("edDeadline").value;c.deadlineISO=d;if(d)c.deadline=new Date(d+"T00:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"});}
}
function detailHasChanges(id){
 const c=contents.find(x=>String(x.id)===String(id));if(!c||!detailOriginalSnapshot)return false;
 if(JSON.stringify(c)!==JSON.stringify(detailOriginalSnapshot))return true;
 const get=name=>document.getElementById(name+id);
 for(const [el,key] of [["edTitle","title"],["edType","type"],["edRatio","ratio"],["edBrief","brief"],["edDeadline","deadlineISO"],["edResponsible","responsibleName"]])if(get(el)&&String(get(el).value||"")!==String(c[key]||""))return true;
 const selected=[...document.querySelectorAll('input[name="edSocial'+id+'"]:checked')].map(x=>x.value).sort();
 const saved=(Array.isArray(c.channel)?c.channel:String(c.channel||"").split(", ")).sort();
 return JSON.stringify(selected)!==JSON.stringify(saved);
}
function showCloseConfirm(id){
 const existing=document.getElementById("closeConfirmPopup");if(existing)existing.remove();
 const popup=document.createElement("div");popup.id="closeConfirmPopup";popup.className="confirm-center-backdrop";
 popup.innerHTML=`<div class="confirm-center-card" role="dialog" aria-modal="true" aria-labelledby="closeConfirmTitle">
  <div class="confirm-center-icon">!</div>
  <h3 id="closeConfirmTitle">Ada perubahan belum disimpan</h3>
  <p>Perubahan pada detail konten ini belum disimpan. Apa yang ingin kamu lakukan?</p>
  <div class="confirm-center-actions">
   <button class="confirm-save" type="button" onclick="resolveCloseConfirm(${id},'save')">Simpan & Keluar</button>
   <button class="confirm-discard" type="button" onclick="resolveCloseConfirm(${id},'discard')">Keluar Tanpa Simpan</button>
   <button class="confirm-cancel" type="button" onclick="document.getElementById('closeConfirmPopup')?.remove()">Lanjut Mengedit</button>
  </div></div>`;
 document.body.appendChild(popup);
}
function resolveCloseConfirm(id,choice){
 const c=contents.find(x=>String(x.id)===String(id));if(!c)return;
 if(choice==="save"){
  captureDetailForm(id);
  const captionField=document.getElementById("captionEdit"+id);
  if(captionField&&!c.captionApproved){
   const typed=captionField.value.trim(),latest=(c.captionRevisions||[]).slice(-1)[0]?.text||"";
   if(typed&&typed!==latest){alert("Perubahan caption belum dikirim. Klik Kirim Caption / Kirim Revisi Caption terlebih dahulu.");return;}
  }
 }else if(choice==="discard"&&detailOriginalSnapshot){
  const index=contents.findIndex(x=>String(x.id)===String(id));
  contents[index]=JSON.parse(JSON.stringify(detailOriginalSnapshot));
 }
 document.getElementById("closeConfirmPopup")?.remove();
 detailOriginalSnapshot=null;closeModal();renderStats();renderCards();
 if(choice==="save")alert("Perubahan berhasil disimpan. Kamu kembali ke Homepage.");
}
function closeDetail(id){
 const c=contents.find(x=>String(x.id)===String(id));if(!c){closeModal();return;}
 if(detailHasChanges(id)){showCloseConfirm(id);return;}
 detailOriginalSnapshot=null;closeModal();renderStats();renderCards();
}
function saveDetailAndHome(id){
 const c=contents.find(x=>String(x.id)===String(id));if(!c||!ensureEditable(c))return;
 captureDetailForm(id);
 if(!c.channel||!c.channel.length){alert("Pilih minimal satu media sosial.");return;}
 const captionField=document.getElementById("captionEdit"+id);
 if(captionField&&!c.captionApproved){
  const typed=captionField.value.trim(),latest=(c.captionRevisions||[]).slice(-1)[0]?.text||"";
  if(typed&&typed!==latest){alert("Ada perubahan caption yang belum dikirim. Klik Kirim Caption / Kirim Revisi Caption terlebih dahulu.");return;}
 }
 detailOriginalSnapshot=null;closeModal();renderStats();renderCards();alert("Perubahan berhasil disimpan. Kamu kembali ke Homepage.");
}

function openDetail(id){
let c=contents.find(x=>x.id===id);let editable=!isFinalLocked(c);let metadataEditable=editable&&canSubmitContent();
detailOriginalSnapshot=JSON.parse(JSON.stringify(c));
show(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">DETAIL KONTEN</div><h2 style="margin:5px 0">${esc(c.title)}</h2><div>${badge(dashboardStatus(c.status))} <span class="meta detail-social-meta" style="display:inline-flex;margin-left:8px">${socialPlatformBadges(c.channel)} · Deadline ${esc(c.deadline)}</span></div></div><button class="close" onclick="closeDetail(${c.id})">×</button></div><div class="modal-body">

<section class="section detail-info-section">
  <div class="submit-section-head">
    <span class="submit-section-icon" aria-hidden="true">
      <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3.5h10l7 7V28H8z"/><path d="M18 3.5V11h7M12 16h9M12 21h9"/></svg>
    </span>
    <div><h4>Informasi Konten</h4><p>Lengkapi informasi dasar mengenai konten yang diajukan.</p></div>
  </div>
  ${!editable?`<div class="workflow-note" style="margin:16px 18px 0">🔒 Konten sudah FINAL. Seluruh perubahan dan pengiriman baru dikunci.</div>`:""}
  <div class="detail-info-grid">
    <div class="form-group detail-title-field">
      <label for="edTitle${c.id}">Nama / Judul Konten</label>
      <input id="edTitle${c.id}" value="${esc(c.title)}" ${metadataEditable?"":"disabled"} placeholder="Masukan nama / judul konten">
    </div>
    <div class="form-group detail-requester-field">
      <label for="edRequester${c.id}">Pengaju Konten (Username)</label>
      <input id="edRequester${c.id}" value="${esc(c.requesterName||"")}" readonly aria-readonly="true" disabled>
    </div>
    <div class="form-group detail-brief-field">
      <label for="edBrief${c.id}">Brief / Arahan</label>
      <textarea id="edBrief${c.id}" rows="5" ${metadataEditable?"":"disabled"} placeholder="Jelaskan detail konten">${esc(c.brief||"")}</textarea>
    </div>
    <div class="detail-right-fields">
      <div class="form-group">
        <label for="edResponsible${c.id}">PJ Proyek (Username)</label>
        ${pjDropdown("edResponsible"+c.id,c.responsibleName||"",!metadataEditable)}
      </div>
      <div class="detail-deadline-social">
        <div class="form-group">
          <label for="edDeadline${c.id}">Deadline Konten</label>
          <input id="edDeadline${c.id}" type="date" value="${esc(c.deadlineISO||"")}" ${metadataEditable?"":"disabled"} aria-label="Pilih tanggal deadline" title="Pilih tanggal deadline">
        </div>
        <div class="form-group">
          <label>Media Sosial</label>
          <div class="submit-socials detail-socials">
            ${["Instagram","TikTok"].map(x=>`<label class="submit-social"><input type="checkbox" name="edSocial${c.id}" value="${x}" ${metadataEditable?"":"disabled"} ${(Array.isArray(c.channel)?c.channel:String(c.channel||"").split(",").map(v=>v.trim())).includes(x)?"checked":""}>${x==="Instagram"?`<svg class="social-brand-icon instagram-brand" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.7" cy="6.5" r="1.15" fill="currentColor"/></svg>`:`<svg class="social-brand-icon tiktok-brand" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 3v11.1a4.2 4.2 0 1 1-3.4-4.1" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M14.2 3c.4 2.7 2 4.4 4.8 4.8" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>`}${x}</label>`).join("")}
          </div>
        </div>
      </div>
    </div>
    <div class="detail-hidden-fields" aria-hidden="true">
      <select id="edType${c.id}"><option ${c.type==="Video"?"selected":""}>Video</option><option ${c.type==="Grafis"?"selected":""}>Grafis</option></select>
      <select id="edRatio${c.id}"><option ${c.ratio==="1:1"?"selected":""}>1:1</option><option ${c.ratio==="4:5"?"selected":""}>4:5</option><option ${c.ratio==="9:16"?"selected":""}>9:16</option></select>
    </div>
    <div class="detail-info-save">
      <button class="btn secondary" type="button" ${metadataEditable?"":"disabled"} onclick="saveDetailInfo(${c.id})">✓ Simpan Informasi</button>
    </div>
  </div>
</section>

<div class="detail-resource-grid">
  <section class="section detail-resource-card">
    <div class="submit-section-head">
      <span class="submit-section-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 20 9-9a5 5 0 0 0-7-7l-9 9a7 7 0 0 0 10 10l10-10"/></svg>
      </span>
      <div><h4>Referensi</h4><p>Referensi dapat berupa file, teks atau link</p></div>
    </div>
    <div class="detail-resource-content resource-mode-content">
      ${(c.referenceFiles||[]).map((f,i)=>editableItemRow(f,"reference",c.id,i,editable)).join("")}
      ${(c.referenceFiles||[]).some(f=>f.kind==="file")?`<button class="btn secondary" onclick="downloadAllItems(${c.id},'reference')">↓ Download Semua File Referensi</button>`:""}
      <div class="input-tabs resource-input-tabs">
        <button type="button" class="input-tab active" onclick="switchInput('ref${c.id}','file',this)">📎 File</button>
        <button type="button" class="input-tab" onclick="switchInput('ref${c.id}','text',this)">✎ Teks</button>
        <button type="button" class="input-tab" onclick="switchInput('ref${c.id}','link',this)">🔗 Link</button>
      </div>
      <div id="ref${c.id}-file" class="input-panel active">
        <label class="submit-file-picker">
          <input id="addRefFile${c.id}" type="file" ${metadataEditable?"":"disabled"} multiple onchange="addReferences(${c.id})">
          <span class="submit-file-button"><span aria-hidden="true">↥</span> Pilih file</span>
          <span class="submit-file-names">Pilih file referensi</span>
        </label>
      </div>
      <div id="ref${c.id}-text" class="input-panel">
        <div class="form-group">
          <textarea id="addRefText${c.id}" rows="4" placeholder="Tulis informasi referensi di sini..." ${metadataEditable?"":"disabled"}></textarea>
          <button type="button" class="btn secondary" onclick="addReferenceText(${c.id})" ${metadataEditable?"":"disabled"}>Tambah Referensi Teks</button>
        </div>
      </div>
      <div id="ref${c.id}-link" class="input-panel">
        <div class="inline-edit">
          <input id="addRefLink${c.id}" type="url" placeholder="Masukkan tautan referensi (https://...)" ${metadataEditable?"":"disabled"}>
          <button type="button" class="btn secondary" onclick="addReferenceLink(${c.id})" ${metadataEditable?"":"disabled"}>Tambah Link</button>
        </div>
      </div>
    </div>
  </section>

  <section class="section detail-resource-card">
    <div class="submit-section-head">
      <span class="submit-section-icon" aria-hidden="true">
        <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 8-9 9a5 5 0 0 0 7 7l10-10a7 7 0 0 0-10-10L6 14"/></svg>
      </span>
      <div><h4>Bahan / Footage</h4><p>Footage dapat berupa file, teks atau link</p></div>
    </div>
    <div class="detail-resource-content resource-mode-content">
      ${c.materials.map((f,i)=>editableItemRow(f,"material",c.id,i,editable)).join("")}
      ${c.materials.some(f=>f.kind==="file")?`<button class="btn secondary" onclick="downloadAllItems(${c.id},'material')">↓ Download Semua File Bahan</button>`:""}
      <div class="input-tabs resource-input-tabs">
        <button type="button" class="input-tab active" onclick="switchInput('mat${c.id}','file',this)">📎 File</button>
        <button type="button" class="input-tab" onclick="switchInput('mat${c.id}','text',this)">✎ Teks</button>
        <button type="button" class="input-tab" onclick="switchInput('mat${c.id}','link',this)">🔗 Link</button>
      </div>
      <div id="mat${c.id}-file" class="input-panel active">
        <label class="submit-file-picker">
          <input id="addMatFile${c.id}" type="file" ${metadataEditable?"":"disabled"} multiple onchange="addMaterials(${c.id})">
          <span class="submit-file-button"><span aria-hidden="true">↥</span> Pilih file</span>
          <span class="submit-file-names">Pilih file bahan / footage</span>
        </label>
      </div>
      <div id="mat${c.id}-text" class="input-panel">
        <div class="form-group">
          <textarea id="addMatText${c.id}" rows="4" placeholder="Tulis informasi bahan / footage di sini..." ${metadataEditable?"":"disabled"}></textarea>
          <button type="button" class="btn secondary" onclick="addMaterialText(${c.id})" ${metadataEditable?"":"disabled"}>Tambah Bahan Teks</button>
        </div>
      </div>
      <div id="mat${c.id}-link" class="input-panel">
        <div class="inline-edit">
          <input id="addMatLink${c.id}" type="url" placeholder="Masukkan tautan bahan / footage (https://...)" ${metadataEditable?"":"disabled"}>
          <button type="button" class="btn secondary" onclick="addMaterialLink(${c.id})" ${metadataEditable?"":"disabled"}>Tambah Link</button>
        </div>
      </div>
    </div>
  </section>
</div>

<div class="section draft-detail-section">
<div class="submit-section-head detail-standard-head">
  <span class="submit-section-icon" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3.5h10l7 7V28H8z"/>
      <path d="M18 3.5V11h7M12 15h8M12 19h5"/>
      <path d="m17 25 7-7 3 3-7 7-4 1z"/>
    </svg>
  </span>
  <div class="detail-standard-heading">
    <h4>Draft & Revisi — Satu Alur</h4>
    <p>Kelola draft, komentar, dan revisi hingga mendapat ACC.</p>
  </div>
</div>
<div class="draft-detail-content">
<p style="margin-top:0">Setiap versi draft memiliki komentar dan riwayatnya sendiri. Upload draft → beri komentar → perbaiki → upload revisi berikutnya. Proses berulang sampai draft terakhir mendapat <b>ACC</b>.</p>
${c.drafts.length?`<div class="timeline">${c.drafts.map((d,i)=>({d,originalIndex:i})).reverse().map(({d,originalIndex:i})=>`<div class="version"><strong>Draft ${i+1} ${d.finalApproved?'<span class="badge b-green">FINAL · ACC</span>':''}</strong><p>Diunggah: ${esc(d.date||'-')}</p><div class="file"><div style="min-width:0"><div class="file-name">${d.type==="link"?"🔗":d.type==="text"?"✍️":"📄"} ${esc(d.type==="link"?(d.text||d.name):d.type==="text"?"Draft Teks":d.name)}</div><div class="file-size">${esc(d.size||"")}${d.type==="text"&&d.text?` · ${esc(d.text.slice(0,100))}${d.text.length>100?"…":""}`:""}</div></div>${d.type==="link"?`<a class="btn secondary" href="${esc(d.text||d.name)}" target="_blank" rel="noopener">↗ Buka Link</a>`:d.type==="text"?`<button class="btn secondary" onclick="viewDraftText(${c.id},${i})">Lihat Teks</button>`:`<button class="btn secondary" onclick="downloadNamed('${esc(d.name)}')">↓ Download</button>`}</div>
<div class="comment-history"><div class="meta" style="margin:8px 0 5px;font-weight:800">RIWAYAT KOMENTAR DRAFT ${i+1}</div>${d.comments&&d.comments.length?d.comments.map(cm=>`<div class="comment"><b>${esc(cm.user||'Humas')} · ${esc(cm.date||'')}</b>${esc(cm.text)}</div>`).join(""):'<div class="comment" style="color:#94a3b8">Belum ada komentar untuk versi ini.</div>'}</div>
${canEdit()&&!d.finalApproved?`<div class="comment-form" style="margin-top:9px"><textarea id="draftComment${c.id}_${i}" rows="2" placeholder="Tulis catatan revisi untuk Draft ${i+1}..."></textarea><button type="button" class="btn secondary" style="margin-top:7px" onclick="addDraftComment(${c.id},${i})">Kirim Revisi Draft ${i+1}</button></div>`:''}
${canEdit()&&i===c.drafts.length-1&&!d.finalApproved?`<div class="actions" style="margin-top:10px"><button type="button" class="btn primary" onclick="approveContent(${c.id})">✓ ACC — Jadikan Draft Ini FINAL</button></div>`:''}
</div>`).join("")}</div>`:'<p>Belum ada draft. Silakan unggah draft pertama untuk memulai proses.</p>'}
${canEdit()?`<div style="margin-top:14px"><div class="workflow-note">${c.drafts.length?'Belum ACC? Unggah versi revisi baru kapan saja. Semua versi dan komentar sebelumnya tetap tersimpan.':'Unggah draft pertama melalui file, teks, atau link.'}</div>
<div class="input-tabs" style="margin-top:10px"><button type="button" class="input-tab active" onclick="switchInput('dp${c.id}','file',this)">📎 File</button><button type="button" class="input-tab" onclick="switchInput('dp${c.id}','text',this)">✎ Teks</button><button type="button" class="input-tab" onclick="switchInput('dp${c.id}','link',this)">🔗 Link</button></div>
<div id="dp${c.id}-file" class="input-panel active"><div class="upload"><input id="draft${c.id}" type="file" multiple onchange="addDraftFiles(${c.id})"></div></div>
<div id="dp${c.id}-text" class="input-panel"><div class="form-group"><textarea id="draftText${c.id}" rows="3" placeholder="Tulis draft / revisi..."></textarea><button class="btn secondary" style="margin-top:7px" onclick="addDraftText(${c.id})">Tambah Draft Teks</button></div></div>
<div id="dp${c.id}-link" class="input-panel"><div class="inline-edit"><input id="draftLink${c.id}" type="url" placeholder="https://..."><button class="btn secondary" onclick="addDraftLink(${c.id})">Tambah Link</button></div></div></div>`:''}
</div>
</div>

<div class="section caption-final-detail-section">
<div class="submit-section-head detail-standard-head">
  <span class="submit-section-icon" aria-hidden="true">
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">
      <path d="M8 3.5h10l7 7V28H8z"/>
      <path d="M18 3.5V11h7M12 15h8"/>
      <path d="m11 22 4 4 9-9"/>
    </svg>
  </span>
  <div class="detail-standard-heading">
    <h4>Caption & FINAL</h4>
    <p>Kelola caption dan file final konten.</p>
  </div>
</div>
<div class="caption-final-detail-content">
<div class="section" style="background:#f8fafc;margin:0 0 14px">
<div class="meta" style="font-weight:800;margin-bottom:8px">CAPTION ${c.captionApproved?'<span class="badge b-green">ACC · TERKUNCI</span>':''}</div>
${!c.captionApproved&&editable?`<textarea id="captionEdit${c.id}" rows="7" style="width:100%;border:1px solid #d1d5db;border-radius:10px;padding:12px;line-height:1.6;resize:vertical" placeholder="${(c.captionRevisions||[]).length?'Tulis caption yang sudah diperbaiki sesuai komentar...':'Tulis caption pertama di sini...'}">${esc(c.caption||"")}</textarea><div class="actions" style="margin-top:8px"><button type="button" class="btn secondary" onclick="submitCaptionRevision(${c.id},this)">${(c.captionRevisions||[]).length?'Kirim Revisi Caption':'Kirim Caption Pertama'}</button></div>`:`<div style="white-space:pre-wrap;line-height:1.6">${esc(c.caption||"Belum ada caption.")}</div>`}
<p class="meta" style="margin:8px 0 0">${c.captionApproved?"Caption sudah di-ACC.": "Kirim caption terlebih dahulu. Setelah itu, komentar dan revisi dapat dilakukan berulang sampai ACC."}</p>
</div>
<div class="meta" style="font-weight:800;margin:10px 0">RIWAYAT CAPTION & KOMENTAR</div>
${(c.captionRevisions||[]).length?`<div class="timeline">${c.captionRevisions.map((v,i)=>({v,i})).reverse().map(({v,i})=>`<div class="version"><strong>Caption ${i+1} ${c.captionApproved&&i===c.captionRevisions.length-1?'<span class="badge b-green">ACC</span>':''}</strong><p class="meta">Dikirim: ${esc(v.date||"-")}</p><div style="white-space:pre-wrap;margin:10px 0">${esc(v.text||"")}</div><div class="comment-history">${(v.comments||[]).length?v.comments.map(cm=>`<div class="comment"><b>${esc(cm.user||"Humas")} · ${esc(cm.date||"")}</b>${esc(cm.text||"")}</div>`).join(""):'<div class="comment" style="color:#94a3b8">Belum ada komentar.</div>'}</div>${editable&&!c.captionApproved?`<div class="comment-form" style="margin-top:9px"><textarea id="captionComment${c.id}_${i}" rows="2" placeholder="Tulis komentar / arahan revisi untuk Caption ${i+1}..."></textarea><button type="button" class="btn secondary" style="margin-top:7px" onclick="addCaptionComment(${c.id},${i})">Kirim Komentar</button></div>`:""}</div>`).join("")}</div>`:'<p class="meta">Belum ada caption yang dikirim.</p>'}
${editable&&!c.captionApproved&&(c.captionRevisions||[]).length?`<div class="actions" style="margin-top:12px"><button type="button" class="btn primary" onclick="approveCaption(${c.id})">✓ ACC Caption Terakhir</button></div>`:""}
</div>
</div>

${c.schedule?`<div class="section"><h4>⑥ Jadwal Publish</h4><p><b>${esc(c.schedule)}</b></p>${canEdit()?`<button class="btn secondary" onclick="scheduleContent(${c.id})">✎ Ubah Jadwal</button>`:""}</div>`:""}<div class="actions detail-footer-actions">${editable?`<button class="btn secondary" onclick="saveDetailAndHome(${c.id})">✓ Simpan</button>`:""}<button class="btn ghost" onclick="closeDetail(${c.id})">Tutup</button></div>
</div></div>`);
}
async function addMaterials(id){let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let files=[...document.getElementById("addMatFile"+id).files];for(const f of files)c.materials.push({kind:"file",name:f.name,size:formatSize(f.size),type:fileType(f.name),mime:f.type,dataUrl:await fileToDataURL(f)});openDetail(id);renderCards()}
async function addReferences(id){if(!canSubmitContent()){alert("Editor hanya dapat mengirim Draft/Revisi, Caption, dan komentar.");return;}
 let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
 const input=document.getElementById("addRefFile"+id);if(!input)return;
 const files=[...(input.files||[])];if(!files.length)return;
 c.referenceFiles=c.referenceFiles||[];
 try{
  for(const f of files){
   const dataUrl=await fileToDataURL(f);
   c.referenceFiles.push({kind:"file",name:f.name,size:formatSize(f.size),type:fileType(f.name),mime:f.type||"application/octet-stream",dataUrl});
  }
  openDetail(id);renderCards();
 }catch(err){alert("File referensi gagal dibaca. Coba pilih file kembali.");}
}
function addMaterialText(id){if(!ensureEditable(contents.find(x=>x.id===id)))return;let v=document.getElementById("addMatText"+id).value.trim();if(!v)return;contents.find(x=>x.id===id).materials.push({kind:"text",name:"Bahan / Footage (Teks)",text:v,size:"Teks",type:"text"});openDetail(id)}
function addMaterialLink(id){if(!ensureEditable(contents.find(x=>x.id===id)))return;let v=document.getElementById("addMatLink"+id).value.trim();if(!v)return;contents.find(x=>x.id===id).materials.push({kind:"link",name:v,text:v,size:"Link",type:"link"});openDetail(id)}
function addReferenceText(id){
 let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
 const el=document.getElementById("addRefText"+id),v=el?.value.trim();if(!v){alert("Tulis referensi terlebih dahulu.");return;}
 c.referenceFiles=c.referenceFiles||[];c.referenceFiles.push({kind:"text",name:"Referensi (Teks)",text:v,size:"Teks",type:"text"});
 openDetail(id);renderCards();
}
function addReferenceLink(id){
 let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
 const el=document.getElementById("addRefLink"+id),v=el?.value.trim();if(!v){alert("Masukkan tautan referensi terlebih dahulu.");return;}
 try{const u=new URL(v);if(!["http:","https:"].includes(u.protocol))throw new Error("protocol");}
 catch(e){alert("Tautan tidak valid. Gunakan alamat yang diawali http:// atau https://");return;}
 c.referenceFiles=c.referenceFiles||[];c.referenceFiles.push({kind:"link",name:v,text:v,size:"Link",type:"link"});
 openDetail(id);renderCards();
}
function editableItemRow(f,kind,id,i,editable=true){return `<div class="file"><div style="min-width:0"><div class="file-name">${f.kind==="link"?"🔗":f.kind==="text"?"✎":"📎"} ${esc(f.name)}</div><div class="file-size">${esc(f.size||"")}</div>${f.text?`<div class="item-note" style="margin-top:4px">${esc(f.text)}</div>`:""}</div><div class="actions"><button class="btn secondary" onclick="previewItem(${id},'${kind}',${i})">👁 Preview</button>${f.kind==="file"?`<button class="btn secondary" onclick="downloadItem(${id},'${kind}',${i})">↓ Download</button>`:""}${editable?`<button class="btn danger" onclick="removeItem('${kind}',${id},${i})">Hapus</button>`:""}</div></div>`}
function removeItem(kind,id,i){let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;if(kind==="material")c.materials.splice(i,1);else c.referenceFiles.splice(i,1);openDetail(id);renderCards()}
function sendCaptionRevision(id){
 let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
 if(c.captionApproved){alert("Caption sudah di-ACC dan dikunci.");return;}
 let value=document.getElementById("captionEdit"+id)?.value.trim();
 if(!value){alert("Tulis caption terlebih dahulu.");return;}
 c.captionVersions=c.captionVersions||[];
 const date=new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
 c.captionVersions.push({text:value,date,comments:[],approved:false});
 c.caption=value;c.captionApproved=false;c.captionComments=c.captionComments||[];
 openDetail(id);renderCards();alert("Versi caption berhasil dikirim. Masukan dapat ditulis pada kolom komentar di versi tersebut.");
}
function addCaptionVersionComment(id,index){
 let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
 if(c.captionApproved){alert("Caption sudah di-ACC dan dikunci.");return;}
 let v=c?.captionVersions?.[index],el=document.getElementById("captionVersionComment"+id+"_"+index),note=el?.value.trim();
 if(!v||!note){alert("Tulis masukan terlebih dahulu.");return;}
 v.comments=v.comments||[];
 v.comments.push({user:currentUser||"Humas",text:note,date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})});
 openDetail(id);renderCards();
}
function saveCaption(id){
 const c=contents.find(x=>x.id===id);if(!c||!ensureEditable(c))return;
 if(!c.captionApproved&&document.getElementById("captionEdit"+id)){
  const typed=document.getElementById("captionEdit"+id).value.trim();
  if(typed && typed!==c.caption){alert("Untuk menyimpan perubahan caption, klik Kirim Caption / Kirim Revisi Caption terlebih dahulu.");return;}
 }
 openDetail(id);renderCards();alert("Perubahan tersimpan.");
}

async function saveDetailInfo(id){if(!canSubmitContent()){alert("Editor hanya dapat mengirim Draft/Revisi, Caption, dan komentar.");return;}let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;c.title=document.getElementById("edTitle"+id).value;c.responsibleName=document.getElementById("edResponsible"+id).value;c.type=document.getElementById("edType"+id).value;c.ratio=document.getElementById("edRatio"+id).value;c.channel=[...document.querySelectorAll('input[name="edSocial'+id+'"]:checked')].map(x=>x.value);if(!c.channel.length){alert("Pilih minimal satu media sosial.");return}c.brief=document.getElementById("edBrief"+id).value;let d=document.getElementById("edDeadline"+id).value;if(d){c.deadlineISO=d;c.deadline=new Date(d+"T00:00:00").toLocaleDateString("id-ID",{day:"numeric",month:"short",year:"numeric"})}const addCombined=(field,kind)=>{const el=document.getElementById(field+id),value=el?.value.trim();if(!value)return;const isUrl=/^(https?:\/\/|www\.)/i.test(value);const item={kind:isUrl?"link":"text",name:kind==="material"?(isUrl?value:"Bahan / Footage (Teks)"):(isUrl?value:"Referensi (Teks)"),text:value,size:isUrl?"Link":"Teks",type:isUrl?"link":"text"};if(kind==="material")c.materials.push(item);else{c.referenceFiles=c.referenceFiles||[];c.referenceFiles.push(item);}};addCombined("addRefCombined","reference");addCombined("addMatCombined","material");openDetail(id);renderCards();alert("Informasi berhasil diperbarui.")}
async function addDraftFiles(id){
  let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let input=document.getElementById("draft"+id);
  let files=[...(input?.files||[])];
  if(!files.length){alert("Pilih file draft terlebih dahulu.");return;}
  try{
    c.final=null;c.drafts.forEach(d=>{d.finalApproved=false;});
    for(const f of files){
      c.drafts.push({name:f.name,size:formatSize(f.size),type:"file",mime:f.type||"application/octet-stream",dataUrl:await fileToDataURL(f),date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),comments:[]});
    }
    c.status="Revisi";openDetail(id);renderStats();renderCards();
  }catch(error){alert("File draft gagal dibaca. Coba pilih kembali.");}
}

function addDraftText(id){
  let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let el=document.getElementById("draftText"+id), t=el.value.trim();
  if(!t){alert("Teks draft wajib diisi.");return;}
  c.final=null;c.drafts.forEach(d=>{d.finalApproved=false;});
  c.drafts.push({name:"Draft Teks",size:"Teks",type:"text",text:t,date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),comments:[],needsNewDraft:false});
  c.status="Revisi";openDetail(id);renderStats();renderCards();
}
function addDraftLink(id){
  let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let el=document.getElementById("draftLink"+id), link=el.value.trim();
  if(!link){alert("Link draft wajib diisi.");return;}
  c.final=null;c.drafts.forEach(d=>{d.finalApproved=false;});
  c.drafts.push({name:link,size:"Link",type:"link",text:link,date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"}),comments:[],needsNewDraft:false});
  c.status="Revisi";openDetail(id);renderStats();renderCards();
}
function addDrafts(id){addDraftFiles(id)}
function addDraftComment(id,index){
  let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let d=c?.drafts?.[index], el=document.getElementById(`draftComment${id}_${index}`), t=el?.value.trim();
  if(!d||!t){alert("Tulis komentar terlebih dahulu.");return;}
  if(d.finalApproved){alert("Draft yang sudah di-ACC tidak dapat diberi komentar revisi.");return;}
  d.comments=d.comments||[];
  d.comments.push({user:currentUser||"Humas",text:t,date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})});
  c.status="Revisi";openDetail(id);renderStats();renderCards();
}
function addComment(id){let c=contents.find(x=>x.id===id);if(c?.drafts?.length)addDraftComment(id,c.drafts.length-1);}
function viewDraftText(id,index){let d=contents.find(x=>x.id===id)?.drafts?.[index];if(d)alert("Isi Draft "+(index+1)+":\n\n"+(d.text||""));}

async function addReferences(id){let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let files=[...document.getElementById("addRefFile"+id).files];c.referenceFiles=c.referenceFiles||[];for(const f of files)c.referenceFiles.push({kind:"file",name:f.name,size:formatSize(f.size),type:fileType(f.name),mime:f.type,dataUrl:await fileToDataURL(f)});openDetail(id)}
function editCaption(id){let c=contents.find(x=>x.id===id),v=prompt("Masukkan caption:",c.caption||"");if(v===null)return;if(v!==c.caption)c.captionApproved=false;c.caption=v;openDetail(id);renderCards()}
function editContent(id){if(!canSubmitContent()){alert("Editor hanya dapat mengirim Draft/Revisi, Caption, dan komentar.");return;}let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;show(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">EDIT INFORMASI</div><h2 style="margin:5px 0">Ubah Konten</h2></div><button class="close" onclick="closeModal()">×</button></div><div class="modal-body"><form class="form" onsubmit="saveContentEdit(event,${c.id})">
<div class="form-group"><label>Nama / Judul Konten</label><input id="eTitle" value="${esc(c.title)}" required placeholder="Masukkan nama / judul konten"></div>
<div class="three"><div class="form-group"><label>Jenis Konten</label><select id="eType" aria-label="Pilih jenis konten">${["Video","Grafis"].map(x=>`<option ${x===c.type?"selected":""}>${x}</option>`).join("")}</select></div><div class="form-group"><label>Media Sosial</label><select id="eChannel" aria-label="Pilih media sosial">${["TikTok","Instagram"].map(x=>`<option ${x===c.channel?"selected":""}>${x}</option>`).join("")}</select></div><div class="form-group"><label>Rasio Konten</label><select id="eRatio" aria-label="Pilih rasio konten">${["1:1","4:5","9:16"].map(x=>`<option ${x===(c.ratio||"1:1")?"selected":""}>${x}</option>`).join("")}</select></div></div>
<div class="form-group"><label>Brief / Arahan</label><textarea id="eBrief" rows="4" placeholder="Jelaskan detail konten dan arahan pengerjaan...">${esc(c.brief||"")}</textarea></div>
<div class="form-group"><label>Deadline</label><input id="eDeadline" value="${esc(c.deadline)}" placeholder="Pilih tanggal deadline"></div>
<div class="actions"><button type="button" class="btn ghost" onclick="closeModal()">Batal</button><button class="btn primary">Simpan Perubahan</button></div></form></div></div>`)}
function saveContentEdit(e,id){if(!canSubmitContent()){alert("Editor hanya dapat mengirim Draft/Revisi, Caption, dan komentar.");return;}e.preventDefault();let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;c.title=document.getElementById("eTitle").value;c.type=document.getElementById("eType").value;c.channel=document.getElementById("eChannel").value;c.ratio=document.getElementById("eRatio").value;c.brief=document.getElementById("eBrief").value;c.deadline=document.getElementById("eDeadline").value;closeModal();openDetail(id);renderCards()}
function submitCaptionRevision(id,button){
 const c=contents.find(x=>String(x.id)===String(id));if(!c||!ensureEditable(c)||c.captionApproved)return;
 // Ambil textarea dari panel tombol yang diklik agar tidak salah sasaran jika ID elemen berubah/duplikat.
 const panel=button?.closest(".section");
 const field=panel?.querySelector('textarea[id^="captionEdit"]')||document.getElementById("captionEdit"+id);
 const value=field?.value?.trim()||"";
 if(!value){alert("Isi caption terlebih dahulu.");return;}
 c.captionRevisions=c.captionRevisions||[];
 const latest=c.captionRevisions[c.captionRevisions.length-1];
 if(latest&&latest.text===value){alert("Caption belum berubah dari versi terakhir.");return;}
 const date=new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
 c.captionRevisions.push({text:value,date,comments:[]});c.caption=value;
 openDetail(id);renderCards();
}
function addCaptionComment(id,index){
 const c=contents.find(x=>x.id===id);if(!c||!ensureEditable(c)||c.captionApproved)return;
 const v=c.captionRevisions?.[index],el=document.getElementById("captionComment"+id+"_"+index),note=el?.value.trim();
 if(!v||!note){alert("Tulis komentar terlebih dahulu.");return;}
 v.comments=v.comments||[];
 v.comments.push({user:currentUser||"Humas",text:note,date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})});
 openDetail(id);renderCards();
}
function approveCaption(id){if(!canApprove()){alert("Editor tidak memiliki akses ACC Caption.");return;}
 const c=contents.find(x=>x.id===id);if(!c||!ensureEditable(c)||c.captionApproved)return;
 const versions=c.captionRevisions||[];
 if(!versions.length){alert("Kirim caption pertama sebelum ACC.");return;}
 const unsent=document.querySelector('#captionEdit'+CSS.escape(String(id)))?.value.trim();
 if(unsent!==versions[versions.length-1].text){alert("Ada perubahan caption yang belum dikirim. Klik Kirim Revisi Caption terlebih dahulu.");return;}
 c.caption=versions[versions.length-1].text;c.captionApproved=true;
 c.captionApprovedAt=new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});
 openDetail(id);renderCards();renderStats();
 alert("Caption berhasil di-ACC. Proyek akan terkunci sepenuhnya jika Draft/Revisi juga sudah di-ACC.");
}
function approveContent(id){if(!canApprove()){alert("Editor tidak memiliki akses ACC Draft/Revisi.");return;}
  let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;
  if(!c.drafts.length){alert("Upload draft terlebih dahulu sebelum disetujui.");return}
  let d=c.drafts[c.drafts.length-1];
  if(d.finalApproved){alert("Draft terakhir sudah berstatus FINAL.");return;}
  // Semua project tetap editable. Jika project sudah terjadwal/publish,
  // pertahankan status publikasinya setelah revisi di-ACC.
  const previousStatus=c.status;
  if(previousStatus!=="Publish" && previousStatus!=="Publish Terjadwal"){
    c.status="Approved";
  }else{
    c.status=previousStatus;
  }
  c.final=d.name;
  d.finalApproved=true;
  d.comments=d.comments||[];
  d.comments.push({user:currentUser||"Humas",text:"ACC — disetujui sebagai FINAL.",date:new Date().toLocaleString("id-ID",{weekday:"long",day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"})});
  openDetail(id);renderStats();renderCards();
}
function reopenRevision(id){if(!canApprove()){alert("Editor tidak memiliki akses membuka kembali proyek.");return;}
  let c=contents.find(x=>x.id===id);
  if(!c)return;if(isFinalLocked(c)){alert("Proyek FINAL tidak dapat dibuka kembali untuk revisi karena Draft/Revisi dan Caption sudah sama-sama di-ACC.");return;}
  c.status="Revisi";
  c.revisionReopened=true;
  openDetail(id);renderStats();renderCards();
}
function scheduleContent(id){if(!canApprove()){alert("Editor tidak memiliki akses mengatur publikasi.");return;}let c=contents.find(x=>x.id===id);show(`<div class="modal"><div class="modal-head"><div><div class="eyebrow">PUBLISH TERJADWAL</div><h2 style="margin:5px 0">Atur Jadwal Publish</h2><div class="meta">Pilih tanggal dan jam.</div></div><button class="close" onclick="closeModal()">×</button></div><div class="modal-body"><div class="form"><div class="two"><div class="form-group"><label>Tanggal</label><input id="pubDate" type="date" value="${esc(c.publishDate||"")}" aria-label="Pilih tanggal publikasi" title="Pilih tanggal publikasi"></div><div class="form-group"><label>Jam</label><input id="pubTime" type="time" value="${esc(c.publishTime||"")}" aria-label="Pilih jam publikasi" title="Pilih jam publikasi"></div></div><div class="actions"><button class="btn ghost" onclick="closeModal()">Batal</button><button class="btn primary" onclick="saveSchedule(${id})">✓ Simpan Jadwal</button></div></div></div></div>`)}
function saveSchedule(id){if(!canApprove()){alert("Editor tidak memiliki akses mengatur publikasi.");return;}let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;let d=document.getElementById("pubDate").value,t=document.getElementById("pubTime").value;if(!d||!t){alert("Tanggal dan jam wajib diisi.");return}c.publishDate=d;c.publishTime=t;c.schedule=new Date(d+"T"+t+":00").toLocaleString("id-ID",{day:"numeric",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit"});c.status="Publish Terjadwal";closeModal();openDetail(id);renderStats();renderCards()}
function markPublished(id){if(!canApprove()){alert("Editor tidak memiliki akses mengubah status publikasi.");return;}let c=contents.find(x=>x.id===id);if(!ensureEditable(c))return;c.status="Publish";openDetail(id);renderStats();renderCards()}
function copyCaption(id){let c=contents.find(x=>x.id===id);if(!c?.captionApproved){alert("Caption belum mendapat ACC.");return}navigator.clipboard?.writeText(c.caption||"").then(()=>alert("Caption berhasil dicopy."),()=>alert("Caption: "+c.caption))}
function downloadFinal(id) {
  const c = contents.find(x => x.id === id);
  if (!c || !c.final || !c.drafts?.some(d => d.finalApproved)) {
    alert("File final belum mendapat ACC.");
    return;
  }
  const approvedDraft = [...c.drafts].reverse().find(d => d.finalApproved && (d.name === c.final || !c.final));
  if (!approvedDraft) {
    alert("File final yang sudah mendapat ACC tidak ditemukan.");
    return;
  }
  downloadFileRecord(approvedDraft);
}
function downloadNamed(name) {
  const target = String(name || "");
  for (const c of contents) {
    const candidates = [...(c.drafts || []), ...(c.materials || []), ...(c.referenceFiles || [])];
    const file = candidates.find(f => f && f.name === target && (f.fileUrl || f.dataUrl || f.text));
    if (file) { downloadFileRecord(file); return; }
  }
  alert("File asli tidak ditemukan. Periksa apakah file sudah tersimpan di server.");
}
function fileRow(f){return `<div class="file"><div><div class="file-name">📎 ${esc(f.name)}</div><div class="file-size">${esc(f.size)} · ${esc(f.type||"file")}</div></div><button class="btn secondary" onclick="downloadNamed('${esc(f.name)}')">↓ Download</button></div>`}
function formatSize(n){if(!n)return"0 B";let u=["B","KB","MB","GB"],i=Math.floor(Math.log(n)/Math.log(1024));return (n/Math.pow(1024,i)).toFixed(i?1:0)+" "+u[i]}
function fileType(n){let x=n.split(".").pop().toLowerCase();if(["jpg","jpeg","png","webp","gif"].includes(x))return"image";if(["mp4","mov","avi","mkv"].includes(x))return"video";if(["pdf","doc","docx","xls","xlsx","ppt","pptx","txt"].includes(x))return"document";if(["zip","rar","7z"].includes(x))return"archive";return"file"}
function show(inner){let d=document.createElement("div");d.id="overlay";d.className="overlay";d.innerHTML=inner;document.body.appendChild(d)}
function closeModal(){document.getElementById("overlay")?.remove()}

async function logout(){
  try{await apiRequest("logout",{method:"POST",body:"{}"});}catch(e){}
  currentUser="";currentAccount=null;contents=[];accounts=[];
  login();
}

initializeApp();



function togglePasswordVisibility(inputId, button){
  const input=document.getElementById(inputId);
  if(!input)return;
  const visible=input.type==="password";
  input.type=visible?"text":"password";
  button.classList.toggle("is-visible",visible);
  button.setAttribute("aria-label",visible?"Sembunyikan password":"Tampilkan password");
  button.setAttribute("title",visible?"Sembunyikan password":"Tampilkan password");
  button.innerHTML=visible
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 6.2A10.8 10.8 0 0 1 12 6c6.1 0 9.5 6 9.5 6a16 16 0 0 1-3.1 3.7"/><path d="M6.2 6.2C3.8 7.8 2.5 12 2.5 12s3.4 6 9.5 6c1.2 0 2.3-.2 3.3-.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>';
}
function hchIconForButton(button){
  const text=(button.innerText||button.textContent||"").trim().toLowerCase();
  const action=(button.getAttribute("onclick")||"").toLowerCase();
  if(button.classList.contains("password-toggle"))return null;
  if(button.classList.contains("close")||text==="×"||text==="x")return null;
  if(button.classList.contains("filter")){
    if(text==="semua")return "grid";
    if(text==="belum dikerjakan")return "clipboard";
    if(text==="revisi")return "refresh";
    if(text==="selesai")return "check-circle";
  }
  if(/download|unduh/.test(text)||/download/.test(action))return "download";
  if(/preview|lihat teks/.test(text)||/previewitem|viewdrafttext/.test(action))return "eye";
  if(/hapus|delete/.test(text)||/removeitem|deleteaccount/.test(action))return "trash";
  if(/edit|ubah jadwal/.test(text)||/editaccount|schedulecontent/.test(action))return "edit";
  if(/ajukan konten|tambah akun|tambah draft|tambah referensi|tambah link/.test(text)||/addaccount|adddraft|addreference|addmaterial/.test(action))return "plus";
  if(/kirim caption|kirim revisi|kirim komentar|kirim$/.test(text)||/submitcaptionrevision|adddraftcomment|addcaptioncomment/.test(action))return "send";
  if(/simpan|acc|jadikan|setujui/.test(text)||/save|approve/.test(action))return "check";
  if(/copy|salin/.test(text)||/copycaption/.test(action))return "copy";
  if(/kelola akun|informasi akun/.test(text)||/accountmanagement|myaccount/.test(action))return "users";
  if(/keluar tanpa|batal|tutup|lanjut/.test(text)||/closemodal|closedetail|logout/.test(action))return "x";
  if(/file/.test(text)||/draft/.test(text))return "file";
  if(/teks/.test(text))return "text";
  if(/link/.test(text))return "link";
  if(/jadwal|tanggal/.test(text))return "calendar";
  if(/masuk/.test(text)||/dologin/.test(action))return "login";
  if(button.classList.contains("filter"))return "filter";
  return "check";
}
function hchSvgIcon(name){
  const p={
    download:'<path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M4 20h16"/>',
    eye:'<path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/>',
    trash:'<path d="M4 7h16"/><path d="M10 11v6M14 11v6"/><path d="m6 7 1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    edit:'<path d="m4 16.5-.8 4.3 4.3-.8L19 8.5 15.5 5 4 16.5Z"/><path d="m13.8 6.7 3.5 3.5"/>',
    send:'<path d="m21 3-7.2 18-3.6-7.2L3 10.2 21 3Z"/><path d="M10.2 13.8 21 3"/>',
    plus:'<circle cx="12" cy="12" r="9.5"/><path d="M12 7.5v9M7.5 12h9"/>',
    check:'<path d="m5 12 4.2 4.2L19 6.5"/>',
    copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    users:'<path d="M16 20v-1.5a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7" r="4"/><path d="M22 20v-1.5a4 4 0 0 0-3-3.9M16 3.2a4 4 0 0 1 0 7.6"/>',
    x:'<path d="m6 6 12 12M18 6 6 18"/>',
    file:'<path d="M6 3h8l5 5v13H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    text:'<path d="M4 5h16M4 10h16M4 15h10M4 20h10"/>',
    link:'<path d="M10 13.5 8.5 15a4 4 0 0 1-5.5-5.8l3-3a4 4 0 0 1 5.7 0"/><path d="m14 10.5 1.5-1.5A4 4 0 0 1 21 14.8l-3 3a4 4 0 0 1-5.7 0"/><path d="m8.5 15.5 7-7"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 10h18"/>',
    login:'<path d="M10 17l5-5-5-5M15 12H3"/><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6"/>',
    filter:'<path d="M4 6h16M7 12h10M10 18h4"/>',
    grid:'<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>',
    clipboard:'<rect x="5" y="4.5" width="14" height="17" rx="2"/><rect x="9" y="2.5" width="6" height="4" rx="1.5"/><path d="m8 11 1.5 1.5L12 10M13.5 11h3M8 16l1.5 1.5L12 15M13.5 16h3"/>',
    refresh:'<path d="M20 7v5h-5"/><path d="M4.8 9A7.5 7.5 0 0 1 18 6.5L20 12"/><path d="M4 17v-5h5"/><path d="M19.2 15A7.5 7.5 0 0 1 6 17.5L4 12"/>',
    "check-circle":'<circle cx="12" cy="12" r="9"/><path d="m7.5 12 3 3 6-6"/>'
  };
  return `<svg class="hch-action-icon" viewBox="0 0 24 24" aria-hidden="true">${p[name]||p.check}</svg>`;
}
function hchDecorateButtons(root=document){
  root.querySelectorAll("button").forEach(button=>{
    if(button.dataset.hchDecorated==="1"||button.classList.contains("password-toggle"))return;
    const label=(button.innerText||button.textContent||"").trim();
    if(!label)return;
    if(button.classList.contains("close")||label==="×"||label==="x"){
      button.dataset.hchDecorated="1";return;
    }
    const icon=hchIconForButton(button);
    if(!icon)return;
    // Keep the action wording while replacing inconsistent leading emoji/symbols.
    const clean=label.replace(/^[\s✓✔＋+×✕✎✏️📎🔗⬇↓➤👁️⧉🗑️📅]+\s*/u,"").trim()||label;
    button.innerHTML=hchSvgIcon(icon)+`<span class="hch-button-label">${clean}</span>`;
    button.classList.add("hch-has-icon");
    button.dataset.hchDecorated="1";
  });
}
document.addEventListener("DOMContentLoaded",()=>{
  hchDecorateButtons(document);
  const observer=new MutationObserver(records=>{
    records.forEach(record=>{
      record.addedNodes.forEach(node=>{
        if(node.nodeType===1){
          if(node.matches?.("button"))hchDecorateButtons(node.parentNode||document);
          else hchDecorateButtons(node);
        }
      });
    });
  });
  if(document.body)observer.observe(document.body,{childList:true,subtree:true});
});
