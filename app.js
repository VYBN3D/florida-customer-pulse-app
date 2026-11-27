const PRIVATE_REPO = "VYBN3D/curaleaf-customer-pulse";
let sessionToken = null;
let installPrompt = null;
const $ = (id) => document.getElementById(id);
function setConnection(connected, label) { const pill=$("connection-pill"); pill.className="pill "+(connected?"online":"offline"); pill.innerHTML="<i></i> "+(label||(connected?"PRIVATE DATA CONNECTED":"PRIVATE DATA NOT CONNECTED")); }
function showTab(name) { document.querySelectorAll(".tab").forEach(b=>b.classList.toggle("active",b.dataset.tab===name)); document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active-panel",p.id===name)); }
document.querySelectorAll(".tab").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.tab)));
document.querySelectorAll("[data-go]").forEach(b=>b.addEventListener("click",()=>showTab(b.dataset.go)));
const dialog=$("connect-dialog");
function openConnect(){ $("connect-error").textContent=""; dialog.showModal(); }
$("connect-open").addEventListener("click",openConnect); $("connect-notice").addEventListener("click",openConnect);
document.querySelectorAll("[data-connect]").forEach(b=>b.addEventListener("click",openConnect));
$("cancel-connect").addEventListener("click",()=>dialog.close());
$("github-token").addEventListener("keydown",e=>{if(e.key==="Enter")connectPrivateRepo();});
$("connect-submit").addEventListener("click",connectPrivateRepo);
async function githubGet(path){
 const response=await fetch("https://api.github.com/repos/"+PRIVATE_REPO+"/contents/"+path,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+sessionToken,"X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});
 if(!response.ok){if(response.status===401)throw new Error("GitHub rejected this token. Check that it is active and copied correctly.");if(response.status===404)throw new Error("Private repository not found or this token does not have Contents: Read-only access.");if(response.status===403)throw new Error("GitHub denied access. Check token permissions and organization access.");throw new Error("GitHub returned HTTP "+response.status+".");}
 return response.json();
}
async function connectPrivateRepo(){
 const token=$("github-token").value.trim(); if(!token){$("connect-error").textContent="Paste a fine-grained GitHub token to continue.";return;}
 const button=$("connect-submit");button.disabled=true;button.textContent="Verifying…";$("connect-error").textContent="";sessionToken=token;
 try{
  const repo=await fetch("https://api.github.com/repos/"+PRIVATE_REPO,{headers:{"Accept":"application/vnd.github+json","Authorization":"Bearer "+sessionToken,"X-GitHub-Api-Version":"2022-11-28"},cache:"no-store"});
  if(!repo.ok)throw new Error(repo.status===404?"This GitHub account cannot access the private data repository.":"GitHub repository check failed (HTTP "+repo.status+").");
  const file=await githubGet("archive/catalog.json");const decoded=atob(file.content.replace(/\s/g,""));const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));const catalog=JSON.parse(new TextDecoder().decode(bytes));const tables=catalog.tables||{};
  $("metric-mentions").textContent=(tables.mentions??0).toLocaleString();$("metric-products").textContent=(tables.menu_items??0).toLocaleString();$("metric-stores").textContent=(tables.menu_stores??0).toLocaleString();$("metric-market").textContent=(tables.ommu_market??0).toLocaleString();
  $("last-refresh").textContent="Private archive catalog verified";$("connection-notice").hidden=true;setConnection(true,"PRIVATE DATA ACCESS VERIFIED");$("github-token").value="";dialog.close();$("connect-open").textContent="Disconnect data";$("connect-open").onclick=disconnect;
 }catch(error){sessionToken=null;$("connect-error").textContent=error.message||"Could not connect to the private archive.";}
 finally{button.disabled=false;button.textContent="Verify private access";}
}
function disconnect(){sessionToken=null;["metric-mentions","metric-products","metric-stores","metric-market"].forEach(id=>$(id).textContent="--");$("last-refresh").textContent="Waiting for private archive";$("connection-notice").hidden=false;setConnection(false);$("connect-open").textContent="Connect private data";$("connect-open").onclick=openConnect;}
function clearSession(){if(sessionToken)disconnect();}
window.addEventListener("pagehide",clearSession);document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="hidden")clearSession();});
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();installPrompt=event;$("install-button").hidden=false;});
$("install-button").addEventListener("click",async()=>{if(!installPrompt)return;installPrompt.prompt();await installPrompt.userChoice;installPrompt=null;$("install-button").hidden=true;});
if("serviceWorker"in navigator&&location.protocol.startsWith("http"))window.addEventListener("load",()=>navigator.serviceWorker.register("./sw.js").catch(()=>{}));