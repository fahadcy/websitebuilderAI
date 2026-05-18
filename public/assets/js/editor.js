const siteId=location.pathname.split('/').pop();
const frame=document.getElementById('editor-frame');
const pageSelect=document.getElementById('page-select');
const statusEl=document.getElementById('editor-status');
const selectedLabel=document.getElementById('selected-label');
const selectedHelp=document.getElementById('selected-help');
const textTools=document.getElementById('text-tools');
const imageTools=document.getElementById('image-tools');
const logoTools=document.getElementById('logo-tools');
let csrf='';
let currentPage='index.html';
let selected=null;

init();

async function init(){
  csrf=(await (await fetch('/csrf')).json()).csrfToken;
  const data=await (await fetch(`/api/editor/${siteId}/pages`)).json();
  document.getElementById('editor-site-name').textContent=`Editing ${data.site.businessName}`;
  document.getElementById('preview-link').href=`/preview/${siteId}`;
  document.getElementById('download-link').href=`/download/${siteId}`;
  pageSelect.innerHTML=data.pages.map(page=>`<option value="${page}">${page}</option>`).join('');
  pageSelect.addEventListener('change',()=>loadPage(pageSelect.value));
  bindControls();
  loadPage(data.pages[0]||'index.html');
}

function loadPage(page){
  currentPage=page;
  selected=null;
  updateSelectionUi();
  frame.src=`/generated-sites/${siteId}/${page}?editor=${Date.now()}`;
  frame.addEventListener('load',prepareFrame,{once:true});
}

function prepareFrame(){
  const doc=frame.contentDocument;
  const style=doc.createElement('style');
  style.id='visual-editor-style';
  style.textContent='[data-editor-selected]{outline:3px solid #0b57d0!important;outline-offset:4px!important} a{cursor:pointer}.brand[data-editor-logo-placement="center"]{margin-inline:auto}.brand[data-editor-logo-placement="right"]{margin-left:auto}.site-header[data-editor-brand-align="center"]{justify-content:center}.site-header[data-editor-brand-align="right"]{justify-content:flex-end}.site-header[data-editor-brand-align="left"]{justify-content:flex-start}';
  doc.head.appendChild(style);
  doc.addEventListener('click',(event)=>{
    const target=event.target.closest('.brand,.brand-logo,img,h1,h2,h3,h4,h5,h6,p,span,a,button,li,blockquote,cite,strong,small,label');
    if(!target)return;
    event.preventDefault();
    event.stopPropagation();
    selectElement(target);
  },true);
  statusEl.textContent='Ready. Click text or an image to edit.';
}

function selectElement(element){
  const doc=frame.contentDocument;
  doc.querySelectorAll('[data-editor-selected]').forEach(el=>el.removeAttribute('data-editor-selected'));
  selected=element;
  selected.setAttribute('data-editor-selected','true');
  updateSelectionUi();
}

function updateSelectionUi(){
  textTools.hidden=true;
  imageTools.hidden=true;
  logoTools.hidden=true;
  if(!selected){
    selectedLabel.textContent='Nothing selected';
    selectedHelp.textContent='Click any heading, paragraph, button/link text, or image inside the website preview.';
    return;
  }
  selectedLabel.textContent=selected.tagName.toLowerCase();
  if(isLogoSelection(selected)){
    logoTools.hidden=false;
    selectedHelp.textContent='Logo selected. Change size, placement, or whether the business name appears beside it.';
    const logo=getLogoElement(selected);
    const computed=logo?frame.contentWindow.getComputedStyle(logo):null;
    const size=computed?parseInt(computed.height,10)||64:64;
    document.getElementById('logo-size').value=Math.min(180,Math.max(28,size));
    document.getElementById('logo-size-output').textContent=`${Math.min(180,Math.max(28,size))}px`;
    const header=selected.closest?.('.site-header');
    document.getElementById('logo-placement').value=header?.dataset.editorBrandAlign||getBrandElement(selected)?.dataset.editorLogoPlacement||'default';
    document.getElementById('brand-name-mode').value='keep';
    if(selected.tagName!=='IMG'){
      return;
    }
  }
  selectedHelp.textContent=selected.tagName==='IMG'?'Image selected. Replace it, paste a URL, or update alt text.':'Text selected. Change copy, size, or colour.';
  if(selected.tagName==='IMG'){
    imageTools.hidden=false;
    document.getElementById('image-alt').value=selected.getAttribute('alt')||'';
    document.getElementById('image-url').value=selected.getAttribute('src')||'';
    return;
  }
  textTools.hidden=false;
  document.getElementById('text-content').value=selected.textContent.trim();
  const computed=frame.contentWindow.getComputedStyle(selected);
  const size=parseInt(computed.fontSize,10)||18;
  document.getElementById('font-size').value=Math.min(96,Math.max(12,size));
  document.getElementById('font-size-output').textContent=`${size}px`;
  document.getElementById('text-color').value=rgbToHex(computed.color);
}

function bindControls(){
  document.getElementById('font-size').addEventListener('input',(event)=>{
    document.getElementById('font-size-output').textContent=`${event.target.value}px`;
    if(selected&&selected.tagName!=='IMG')selected.style.fontSize=`${event.target.value}px`;
  });
  document.getElementById('text-color').addEventListener('input',(event)=>{
    if(selected&&selected.tagName!=='IMG')selected.style.color=event.target.value;
  });
  document.getElementById('apply-text').addEventListener('click',()=>{
    if(!selected||selected.tagName==='IMG')return;
    selected.textContent=document.getElementById('text-content').value;
    statusEl.textContent='Text updated. Save when ready.';
  });
  document.getElementById('clear-text-style').addEventListener('click',()=>{
    if(!selected||selected.tagName==='IMG')return;
    selected.style.fontSize='';
    selected.style.color='';
    updateSelectionUi();
  });
  document.getElementById('apply-image').addEventListener('click',applyImage);
  document.getElementById('image-upload').addEventListener('change',uploadImage);
  document.getElementById('logo-size').addEventListener('input',(event)=>{
    document.getElementById('logo-size-output').textContent=`${event.target.value}px`;
    applyLogo({live:true});
  });
  document.getElementById('apply-logo').addEventListener('click',()=>applyLogo({live:false}));
  document.getElementById('reset-logo').addEventListener('click',resetLogo);
  document.getElementById('save-page').addEventListener('click',savePage);
  document.getElementById('page-scale').addEventListener('input',(event)=>{
    document.getElementById('page-scale-output').textContent=`${event.target.value}%`;
  });
  document.getElementById('apply-page-scale').addEventListener('click',()=>{
    const doc=frame.contentDocument;
    const scale=document.getElementById('page-scale').value;
    doc.documentElement.style.fontSize=`${scale}%`;
    statusEl.textContent='Page font scale updated. Save when ready.';
  });
}

async function uploadImage(){
  const file=document.getElementById('image-upload').files[0];
  if(!file)return;
  const form=new FormData();
  form.append('_csrf',csrf);
  form.append('image',file);
  statusEl.textContent='Uploading image...';
  const response=await fetch(`/api/editor/${siteId}/upload`,{method:'POST',headers:{'X-CSRF-Token':csrf},body:form});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Upload failed');
  document.getElementById('image-url').value=data.url;
  applyImage();
  statusEl.textContent='Image uploaded and applied. Save when ready.';
}

function applyImage(){
  if(!selected||selected.tagName!=='IMG')return;
  const url=document.getElementById('image-url').value.trim();
  if(url)selected.setAttribute('src',url);
  selected.setAttribute('alt',document.getElementById('image-alt').value.trim());
}

function isLogoSelection(element){
  return Boolean(element?.classList?.contains('brand-logo')||element?.classList?.contains('brand')||element?.closest?.('.brand'));
}

function getBrandElement(element){
  return element?.classList?.contains('brand')?element:element?.closest?.('.brand');
}

function getLogoElement(element){
  if(element?.classList?.contains('brand-logo'))return element;
  return getBrandElement(element)?.querySelector('img')||null;
}

function applyLogo({live=false}={}){
  if(!selected||!isLogoSelection(selected))return;
  const brand=getBrandElement(selected);
  const logo=getLogoElement(selected);
  const header=brand?.closest('.site-header');
  const size=document.getElementById('logo-size').value;
  const placement=document.getElementById('logo-placement').value;
  const nameMode=document.getElementById('brand-name-mode').value;
  if(logo){
    logo.style.height=`${size}px`;
    logo.style.maxWidth=`${Math.max(Number(size)*3,120)}px`;
  }
  if(brand){
    brand.dataset.editorLogoPlacement=placement;
    brand.style.justifyContent=placement==='center'?'center':placement==='right'?'flex-end':'flex-start';
    brand.style.width=placement==='center'||placement==='right'?'100%':'';
  }
  if(header&&placement!=='default'){
    header.dataset.editorBrandAlign=placement;
    header.style.justifyContent=placement==='center'?'center':placement==='right'?'flex-end':'flex-start';
  }
  if(header&&placement==='default'){
    delete header.dataset.editorBrandAlign;
    header.style.justifyContent='';
  }
  if(brand&&nameMode!=='keep'){
    [...brand.children].forEach((child)=>{
      if(child.tagName!=='IMG')child.hidden=nameMode==='hide';
    });
  }
  statusEl.textContent=live?'Logo size updated. Save when ready.':'Logo layout updated. Save when ready.';
}

function resetLogo(){
  if(!selected||!isLogoSelection(selected))return;
  const brand=getBrandElement(selected);
  const logo=getLogoElement(selected);
  const header=brand?.closest('.site-header');
  if(logo){
    logo.style.height='';
    logo.style.maxWidth='';
  }
  if(brand){
    brand.style.justifyContent='';
    brand.style.width='';
    delete brand.dataset.editorLogoPlacement;
    [...brand.children].forEach((child)=>child.hidden=false);
  }
  if(header){
    delete header.dataset.editorBrandAlign;
    header.style.justifyContent='';
  }
  statusEl.textContent='Logo style reset. Save when ready.';
  updateSelectionUi();
}

async function savePage(){
  const doc=frame.contentDocument;
  doc.querySelectorAll('[data-editor-selected]').forEach(el=>el.removeAttribute('data-editor-selected'));
  doc.getElementById('visual-editor-style')?.remove();
  const html='<!doctype html>\n'+doc.documentElement.outerHTML;
  statusEl.textContent='Saving page and rebuilding ZIP...';
  const response=await fetch(`/api/editor/${siteId}/page`,{
    method:'POST',
    headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},
    body:JSON.stringify({_csrf:csrf,file:currentPage,html})
  });
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'Save failed');
  const score=data.realityCheck?.score;
  statusEl.textContent=score==null?'Saved. Download ZIP now includes your edits.':`Saved. Reality Check Agent score: ${score}/100.`;
  loadPage(currentPage);
}

function rgbToHex(value){
  const match=String(value).match(/\d+/g);
  if(!match||match.length<3)return'#111111';
  return '#'+match.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join('');
}
