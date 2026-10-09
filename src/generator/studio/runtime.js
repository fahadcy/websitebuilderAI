// Front-end runtime shipped with every generated site (assets/js/app.js).
// jQuery drives interactions/counters; scroll work uses rAF + IntersectionObserver.
// In the visual editor (?editor=...) it only reveals content and never rewrites the DOM.

export function buildRuntime({ motion }) {
  const flags = JSON.stringify({ cursor: Boolean(motion.cursor), magnetic: Boolean(motion.magnetic), tilt: Boolean(motion.tilt), preloader: Boolean(motion.preloader) });
  return `/* Site runtime: animations & interactions */
(function(){
  var FLAGS=${flags};
  var doc=document.documentElement;
  var editor=/[?&]editor=/.test(location.search);
  var reduce=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine=window.matchMedia&&matchMedia('(pointer: fine)').matches;
  var $=window.jQuery;

  /* Theme toggle */
  var toggle=document.querySelector('[data-theme-toggle]');
  if(toggle){toggle.addEventListener('click',function(){var next=doc.getAttribute('data-theme')==='dark'?'light':'dark';doc.setAttribute('data-theme',next);});}

  /* Editor mode: change nothing (the editor saves outerHTML). Content is visible without js-motion. */
  if(editor)return;
  doc.classList.add('js-motion');

  /* Preloader */
  var pre=document.querySelector('.preloader');
  function loaded(){doc.classList.add('is-loaded');setTimeout(function(){if(pre&&pre.parentNode)pre.parentNode.removeChild(pre);},1300);startHero();}
  if(pre&&FLAGS.preloader&&!reduce){window.addEventListener('load',function(){setTimeout(loaded,350);});setTimeout(loaded,2200);}else{if(pre)pre.parentNode.removeChild(pre);doc.classList.add('is-loaded');}

  function esc(t){return String(t==null?'':t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
  /* Split headings into words for staggered reveals (real text kept for screen readers) */
  document.querySelectorAll('[data-split]').forEach(function(el){
    if(el.dataset.splitDone)return;el.dataset.splitDone='1';
    var text=el.textContent.trim();
    el.innerHTML='<span class="sr-only">'+esc(text)+'</span>'+text.split(/\\s+/).map(function(w,i){return '<span class="split-w" aria-hidden="true"><span style="--wi:'+i+'">'+esc(w)+'</span></span>';}).join(' ');
  });

  /* Scroll-highlighted statement */
  document.querySelectorAll('[data-scroll-words]').forEach(function(el){
    var text=el.textContent.trim();
    el.innerHTML='<span class="sr-only">'+esc(text)+'</span>'+text.split(/\\s+/).map(function(w){return '<span class="sw" aria-hidden="true">'+esc(w)+'</span>';}).join(' ');
  });

  /* Reveal on scroll */
  var io=('IntersectionObserver' in window)?new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting)reveal(e.target);});},{threshold:.12,rootMargin:'0px 0px -6% 0px'}):null;
  var heroStarted=false;
  function startHero(){if(heroStarted)return;heroStarted=true;observeAll();}
  var pending=[];
  function reveal(el){if(el.classList.contains('is-in'))return;el.classList.add('is-in');if(io)io.unobserve(el);if(el.querySelectorAll)el.querySelectorAll('[data-count]').forEach(countUp);}
  function observeAll(){document.querySelectorAll('[data-reveal],[data-split],.proof-item,.glass-stats').forEach(function(el){if(io){io.observe(el);pending.push(el);}else reveal(el);});sweep();}
  /* Safety net: anything scrolled past (fast scroll, anchor jump) is revealed too. */
  function sweep(){if(!pending.length)return;var vh=window.innerHeight;pending=pending.filter(function(el){if(el.classList.contains('is-in'))return false;if(el.getBoundingClientRect().top<vh*0.92){reveal(el);return false;}return true;});}
  if(!pre||!FLAGS.preloader||reduce)startHero();

  /* Counters (jQuery animate) */
  function countUp(el){
    if(el.dataset.counted)return;el.dataset.counted='1';
    var target=parseFloat(el.dataset.count),dec=parseInt(el.dataset.decimals||'0',10);
    if(reduce||!$||isNaN(target)){return;}
    $({v:0}).animate({v:target},{duration:1600,easing:'swing',step:function(now){el.textContent=dec?now.toFixed(dec):Math.round(now).toLocaleString('en-GB');},complete:function(){el.textContent=dec?target.toFixed(dec):Math.round(target).toLocaleString('en-GB');}});
  }

  /* Header, progress, parallax, statement, timeline: one rAF loop */
  var header=document.querySelector('[data-header]');
  var progress=document.querySelector('.scroll-progress');
  var layers=reduce?[]:Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
  var statements=Array.prototype.slice.call(document.querySelectorAll('[data-scroll-words]'));
  var timelines=Array.prototype.slice.call(document.querySelectorAll('[data-timeline]'));
  var lastY=window.scrollY,ticking=false;
  function frame(){
    var y=window.scrollY,vh=window.innerHeight,max=document.body.scrollHeight-vh;
    if(header){header.classList.toggle('is-scrolled',y>40);header.classList.toggle('is-hidden',y>lastY&&y>420&&!doc.classList.contains('menu-open'));}
    if(progress)progress.style.setProperty('--progress',max>0?(y/max).toFixed(4):0);
    layers.forEach(function(el){var r=el.getBoundingClientRect();if(r.bottom<-200||r.top>vh+200)return;var speed=parseFloat(el.dataset.parallax)||0.2;var offset=(r.top+r.height/2-vh/2)*speed*-1;el.style.transform='translate3d(0,'+offset.toFixed(1)+'px,0)';});
    statements.forEach(function(el){var r=el.getBoundingClientRect();var p=Math.min(1,Math.max(0,(vh*0.85-r.top)/(r.height+vh*0.35)));var spans=el.querySelectorAll('.sw');var n=Math.round(p*spans.length);spans.forEach(function(s,i){s.classList.toggle('on',i<n);});});
    timelines.forEach(function(el){var r=el.getBoundingClientRect();var p=Math.min(1,Math.max(0,(vh*0.6-r.top)/r.height));el.style.setProperty('--fill',p.toFixed(3));});
    sweep();lastY=y;ticking=false;
  }
  window.addEventListener('scroll',function(){if(!ticking){ticking=true;requestAnimationFrame(frame);}},{passive:true});
  window.addEventListener('resize',frame);frame();

  /* Mobile menu: hidden from keyboard/screen readers when closed, Escape closes */
  var menuBtn=document.querySelector('[data-menu-toggle]'),menu=document.querySelector('[data-mobile-menu]'),menuTimer;
  function setMenu(open){
    if(!menuBtn||!menu)return;clearTimeout(menuTimer);
    if(open){menu.hidden=false;requestAnimationFrame(function(){doc.classList.add('menu-open');});var first=menu.querySelector('a');if(first)setTimeout(function(){first.focus();},350);}
    else{doc.classList.remove('menu-open');menuTimer=setTimeout(function(){menu.hidden=true;},reduce?0:700);}
    menuBtn.setAttribute('aria-expanded',String(open));document.body.style.overflow=open?'hidden':'';
  }
  if(menuBtn&&menu){
    menuBtn.addEventListener('click',function(){setMenu(!doc.classList.contains('menu-open'));});
    menu.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){setMenu(false);});});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&doc.classList.contains('menu-open')){setMenu(false);menuBtn.focus();}});
  }

  /* In-page anchors: scroll, then move focus so keyboard users land on the target */
  document.querySelectorAll('a[href^="#"]').forEach(function(a){a.addEventListener('click',function(e){var id=a.getAttribute('href');if(id.length<2)return;var t=document.getElementById(id.slice(1));if(!t)return;e.preventDefault();var top=id==='#top'?0:t.getBoundingClientRect().top+window.scrollY-70;window.scrollTo({top:top,behavior:reduce?'auto':'smooth'});if(!t.hasAttribute('tabindex'))t.setAttribute('tabindex','-1');t.focus({preventScroll:true});if(history.pushState)history.pushState(null,'',id);});});

  /* Magnetic buttons */
  if(FLAGS.magnetic&&fine&&!reduce){document.querySelectorAll('[data-magnetic]').forEach(function(b){b.addEventListener('mousemove',function(e){var r=b.getBoundingClientRect();b.style.setProperty('--bx',((e.clientX-r.left-r.width/2)*0.25).toFixed(1)+'px');b.style.setProperty('--by',((e.clientY-r.top-r.height/2)*0.35).toFixed(1)+'px');});b.addEventListener('mouseleave',function(){b.style.setProperty('--bx','0px');b.style.setProperty('--by','0px');});});}

  /* Tilt cards */
  if(FLAGS.tilt&&fine&&!reduce){document.querySelectorAll('[data-tilt]').forEach(function(c){c.addEventListener('mousemove',function(e){var r=c.getBoundingClientRect();var x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;c.style.transform='perspective(900px) rotateX('+(-y*6).toFixed(2)+'deg) rotateY('+(x*8).toFixed(2)+'deg) translateY(-4px)';});c.addEventListener('mouseleave',function(){c.style.transform='';});});}

  /* Cursor glow */
  if(FLAGS.cursor&&fine&&!reduce){var g=document.createElement('div');g.className='cursor-glow';g.setAttribute('aria-hidden','true');document.body.appendChild(g);window.addEventListener('mousemove',function(e){g.style.setProperty('--cx',e.clientX+'px');g.style.setProperty('--cy',e.clientY+'px');},{passive:true});}

  /* Hover list image preview */
  document.querySelectorAll('[data-hover-list]').forEach(function(list){var prev=list.querySelector('.hover-preview');if(!prev||!fine)return;list.addEventListener('mousemove',function(e){prev.style.setProperty('--hx',(e.clientX+24)+'px');prev.style.setProperty('--hy',(e.clientY-120)+'px');});list.querySelectorAll('.hover-row').forEach(function(r){r.addEventListener('mouseenter',function(){list.classList.add('is-hovering');});r.addEventListener('mouseleave',function(){list.classList.remove('is-hovering');});});});

  /* Tabs */
  document.querySelectorAll('[data-tabs]').forEach(function(t){var tabs=t.querySelectorAll('[role="tab"]');tabs.forEach(function(tab,i){tab.addEventListener('click',function(){select(i);});tab.addEventListener('keydown',function(e){if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();var n=(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;select(n);tabs[n].focus();}});});function select(i){tabs.forEach(function(tab,j){var on=i===j;tab.setAttribute('aria-selected',String(on));tab.tabIndex=on?0:-1;var p=document.getElementById(tab.getAttribute('aria-controls'));if(p)p.hidden=!on;});}});

  /* Accordion (jQuery slide) */
  document.querySelectorAll('[data-accordion] .acc-q').forEach(function(q){q.addEventListener('click',function(){var open=q.getAttribute('aria-expanded')==='true';var panel=document.getElementById(q.getAttribute('aria-controls'));if(!panel)return;q.setAttribute('aria-expanded',String(!open));if($&&!reduce){if(open){$(panel).stop().slideUp(320,function(){panel.hidden=true;});}else{panel.hidden=false;$(panel).hide().stop().slideDown(380);}}else{panel.hidden=open;}});});

  /* Carousel: buttons + drag */
  document.querySelectorAll('[data-carousel]').forEach(function(c){var track=c.querySelector('.carousel-track');if(!track)return;function step(dir){var card=track.querySelector('.carousel-card');var w=card?card.getBoundingClientRect().width+16:300;track.scrollBy({left:dir*w,behavior:reduce?'auto':'smooth'});}var p=c.querySelector('[data-carousel-prev]'),n=c.querySelector('[data-carousel-next]');if(p)p.addEventListener('click',function(){step(-1);});if(n)n.addEventListener('click',function(){step(1);});var down=false,sx=0,sl=0;track.addEventListener('pointerdown',function(e){if(e.pointerType!=='mouse')return;down=true;sx=e.clientX;sl=track.scrollLeft;track.classList.add('is-dragging');});window.addEventListener('pointerup',function(){down=false;track.classList.remove('is-dragging');});track.addEventListener('pointermove',function(e){if(!down)return;track.scrollLeft=sl-(e.clientX-sx);});});

  /* Before / after compare */
  document.querySelectorAll('[data-compare]').forEach(function(f){var r=f.querySelector('.ba-range');if(!r)return;r.addEventListener('input',function(){f.style.setProperty('--pos',r.value+'%');});});

  /* Lightbox */
  document.querySelectorAll('[data-lightbox]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();var box=document.createElement('div');box.className='lightbox';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','Image preview');box.tabIndex=-1;var im=document.createElement('img');im.src=a.getAttribute('href');var inner=a.querySelector('img');im.alt=inner?inner.alt:'';box.appendChild(im);document.body.appendChild(box);box.focus();requestAnimationFrame(function(){box.classList.add('is-open');});function close(){box.classList.remove('is-open');setTimeout(function(){box.remove();},350);document.removeEventListener('keydown',onKey);a.focus();}function onKey(ev){if(ev.key==='Escape')close();}box.addEventListener('click',close);document.addEventListener('keydown',onKey);});});

  /* Testimonial slider: auto-advances, pauses on hover/focus, has a pause button */
  document.querySelectorAll('[data-slider]').forEach(function(s){var q=s.querySelectorAll('.quote'),d=s.querySelectorAll('.slider-dots button[data-dot]'),pb=s.querySelector('[data-slider-pause]'),i=0,timer=null,paused=reduce;function show(n){q[i].classList.remove('is-active');if(d[i])d[i].removeAttribute('aria-current');i=n;q[i].classList.add('is-active');if(d[i])d[i].setAttribute('aria-current','true');}function start(){if(paused||q.length<2)return;clearInterval(timer);timer=setInterval(function(){show((i+1)%q.length);},6000);}function stop(){clearInterval(timer);}d.forEach(function(b,n){b.addEventListener('click',function(){show(n);});});s.addEventListener('mouseenter',stop);s.addEventListener('mouseleave',start);s.addEventListener('focusin',stop);s.addEventListener('focusout',start);if(pb)pb.addEventListener('click',function(){paused=!paused;pb.setAttribute('aria-pressed',String(paused));pb.textContent=paused?'Play':'Pause';if(paused)stop();else start();});start();});

  /* Marquee pause buttons */
  document.querySelectorAll('[data-marquee-toggle]').forEach(function(b){b.addEventListener('click',function(){var m=b.closest('.marquee');var on=!m.classList.contains('is-paused');m.classList.toggle('is-paused',on);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',on?'Play scrolling text':'Pause scrolling text');});});

  /* Interactive collection: filters, sort, favourites, detail dialog, demo booking */
  var colRoot=document.querySelector('[data-collection]');
  if(colRoot){(function(){
    var dataEl=colRoot.querySelector('[data-collection-json]');var D;
    try{D=JSON.parse(dataEl.textContent);}catch(err){return;}
    var grid=colRoot.querySelector('[data-col-grid]'),cards=Array.prototype.slice.call(grid.children),countEl=colRoot.querySelector('[data-col-count]'),empty=colRoot.querySelector('[data-col-empty]');
    var budgetEl=colRoot.querySelector('[data-filter-budget]'),budgetOut=colRoot.querySelector('[data-budget-output]'),sortEl=colRoot.querySelector('[data-sort]'),favFilter=colRoot.querySelector('[data-filter-favourites]'),favCount=colRoot.querySelector('[data-fav-count]');
    var catBtns=Array.prototype.slice.call(colRoot.querySelectorAll('[data-filter-category]'));
    var state={cat:'',budget:budgetEl?parseFloat(budgetEl.max):Infinity,sort:'featured',favOnly:false};
    function attr(t){return esc(String(t==null?'':t)).split('"').join('&quot;');}
    function plural(n){return n===1?D.itemLabel:D.itemLabel+'s';}
    function money(v){try{return new Intl.NumberFormat('en-GB',{style:'currency',currency:D.currency||'GBP',minimumFractionDigits:v%1?2:0,maximumFractionDigits:2}).format(v);}catch(err){return String(v);}}
    function loadFavs(){try{var v=JSON.parse(window.localStorage.getItem(D.storageKey)||'[]');return Array.isArray(v)?v:[];}catch(err){return [];}}
    function saveFavs(){try{window.localStorage.setItem(D.storageKey,JSON.stringify(favs));}catch(err){}}
    var favs=loadFavs();
    function syncFavs(){colRoot.querySelectorAll('[data-fav]').forEach(function(b){var id=b.getAttribute('data-fav');var on=favs.indexOf(id)>-1;var item=find(id);b.setAttribute('aria-pressed',String(on));b.setAttribute('aria-label',(on?'Remove ':'Save ')+(item?item.title:'')+(on?' from favourites':' to favourites'));});if(favCount)favCount.textContent=String(favs.length);}
    function find(id){for(var i=0;i<D.items.length;i++)if(D.items[i].id===id)return D.items[i];return null;}
    function apply(){
      var list=cards.slice();
      if(state.sort==='featured')list.sort(function(a,b){return a.getAttribute('data-index')-b.getAttribute('data-index');});
      else list.sort(function(a,b){var pa=parseFloat(a.getAttribute('data-price'))||0,pb=parseFloat(b.getAttribute('data-price'))||0;return state.sort==='price-asc'?pa-pb:pb-pa;});
      var shown=0;
      list.forEach(function(card){grid.appendChild(card);var p=parseFloat(card.getAttribute('data-price'));var ok=(!state.cat||card.getAttribute('data-category')===state.cat)&&(isNaN(p)||p<=state.budget)&&(!state.favOnly||favs.indexOf(card.getAttribute('data-id'))>-1);card.classList.toggle('is-hidden',!ok);if(ok){shown++;card.classList.add('is-in');}});
      countEl.textContent=(shown<cards.length?shown+' of '+cards.length+' ':shown+' ')+plural(cards.length===1&&shown===1?1:2)+(state.favOnly?' in your favourites':'');
      empty.hidden=shown>0;
    }
    catBtns.forEach(function(b){b.addEventListener('click',function(){state.cat=b.getAttribute('data-filter-category');catBtns.forEach(function(o){o.setAttribute('aria-pressed',String(o===b));});apply();});});
    if(budgetEl)budgetEl.addEventListener('input',function(){state.budget=parseFloat(budgetEl.value);if(budgetOut)budgetOut.textContent=money(state.budget);apply();});
    if(sortEl)sortEl.addEventListener('change',function(){state.sort=sortEl.value;apply();});
    if(favFilter)favFilter.addEventListener('click',function(){state.favOnly=!state.favOnly;favFilter.setAttribute('aria-pressed',String(state.favOnly));apply();});
    var reset=colRoot.querySelector('[data-reset-filters]');
    if(reset)reset.addEventListener('click',function(){state.cat='';state.favOnly=false;state.sort='featured';catBtns.forEach(function(o,i){o.setAttribute('aria-pressed',String(i===0));});if(budgetEl){budgetEl.value=budgetEl.max;state.budget=parseFloat(budgetEl.max);if(budgetOut)budgetOut.textContent=money(state.budget);}if(sortEl)sortEl.value='featured';if(favFilter)favFilter.setAttribute('aria-pressed','false');apply();if(catBtns[0])catBtns[0].focus();});
    colRoot.addEventListener('click',function(e){var b=e.target.closest('[data-fav]');if(!b)return;var id=b.getAttribute('data-fav');var i=favs.indexOf(id);if(i>-1)favs.splice(i,1);else favs.push(id);saveFavs();syncFavs();if(state.favOnly)apply();});

    /* Detail dialog */
    var dlg=colRoot.querySelector('[data-col-modal]'),body=dlg?dlg.querySelector('[data-modal-body]'):null,opener=null;
    function closeDlg(){if(!dlg)return;if(dlg.close)dlg.close();else dlg.removeAttribute('open');}
    if(dlg){dlg.addEventListener('close',function(){document.body.style.overflow='';if(opener)opener.focus();});dlg.addEventListener('click',function(e){if(e.target===dlg)closeDlg();});dlg.querySelector('[data-close-modal]').addEventListener('click',closeDlg);}
    function today(){var d=new Date();d.setMinutes(d.getMinutes()-d.getTimezoneOffset());return d.toISOString().slice(0,10);}
    function render(item){
      var B=D.booking;var meta=[item.category,item.location,item.duration].filter(Boolean).map(esc).join(', ');
      var h='<div class="m-hero"><img class="cover" src="'+attr(item.image)+'" alt="'+attr(item.title)+'"></div><div class="m-grid"><div>';
      h+='<p class="col-meta">'+meta+'</p><h2 id="col-modal-title">'+esc(item.title)+'</h2><p>'+esc(item.summary)+'</p>';
      if(item.highlights&&item.highlights.length)h+='<ul class="m-highlights" aria-label="Highlights">'+item.highlights.map(function(x){return '<li>'+esc(x)+'</li>';}).join('')+'</ul>';
      if(item.itinerary&&item.itinerary.length)h+='<h3>Itinerary</h3><ol class="m-itinerary">'+item.itinerary.map(function(x){return '<li><strong>'+esc(x.title)+'</strong><p>'+esc(x.detail)+'</p></li>';}).join('')+'</ol>';
      h+='</div><aside class="book-card" aria-label="Booking">';
      if(item.price!=null)h+='<p class="price-line"><strong>'+money(item.price)+'</strong><span class="muted">'+esc(D.priceSuffix||'')+'</span></p>';
      if(B&&item.price!=null){
        h+='<form data-book-form novalidate>'
          +field('bk-name','Full name','text','name','autocomplete="name"')
          +field('bk-email','Email address','email','email','autocomplete="email"')
          +field('bk-date',B.dateLabel,'date','date','min="'+today()+'"')
          +field('bk-qty',B.quantityLabel,'number','qty','min="1" max="'+B.maxQuantity+'" step="1" value="2" inputmode="numeric"')
          +'<p class="total-line">Total <output data-total aria-live="polite">'+money(item.price*2)+'</output></p>'
          +'<button class="btn btn-primary" type="submit"><span>'+esc(B.cta)+'</span></button>'
          +'<p class="demo-note">Demo booking only: no payment is taken and no real booking is made.</p></form>';
      }else{h+='<a class="btn btn-primary" href="#contact"><span>Enquire about this '+esc(D.itemLabel)+'</span></a>';}
      h+='</aside></div>';
      return h;
    }
    function field(id,label,type,name,extra){return '<label for="'+id+'">'+esc(label)+'<input id="'+id+'" name="'+name+'" type="'+type+'" required aria-describedby="'+id+'-err" '+extra+'></label><p class="field-error" id="'+id+'-err" role="alert"></p>';}
    function wireForm(item){
      var form=body.querySelector('[data-book-form]');if(!form)return;var B=D.booking;
      var qty=form.querySelector('#bk-qty'),total=form.querySelector('[data-total]');
      function n(){var v=parseInt(qty.value,10);return isNaN(v)?0:v;}
      qty.addEventListener('input',function(){total.textContent=money(item.price*Math.max(0,n()));});
      function setErr(input,msg){var e=form.querySelector('#'+input.id+'-err');e.textContent=msg;input.setAttribute('aria-invalid',msg?'true':'false');return !msg;}
      form.addEventListener('submit',function(e){e.preventDefault();
        var name=form.querySelector('#bk-name'),email=form.querySelector('#bk-email'),date=form.querySelector('#bk-date');
        var em=email.value.trim(),at=em.indexOf('@');
        var ok=[
          setErr(name,name.value.trim().length<2?'Please enter your full name.':''),
          setErr(email,!em?'Please enter your email address.':(at<1||em.lastIndexOf('.')<at+2||em.lastIndexOf('.')===em.length-1)?'Please enter a valid email address, e.g. name@example.com.':''),
          setErr(date,!date.value?'Please choose a departure date.':(date.value<today()?'Please choose a date in the future.':'')),
          setErr(qty,(n()<1||n()>B.maxQuantity)?'Please choose between 1 and '+B.maxQuantity+'.':'')
        ];
        if(ok.indexOf(false)>-1){var first=form.querySelector('[aria-invalid="true"]');if(first)first.focus();return;}
        var when=new Date(date.value+'T12:00:00').toLocaleDateString('en-GB',{weekday:'short',day:'numeric',month:'long',year:'numeric'});
        var conf='<div class="confirm" tabindex="-1" data-confirm><h3>Demo booking request received</h3><dl><dt>'+esc(D.itemLabel.charAt(0).toUpperCase()+D.itemLabel.slice(1))+'</dt><dd>'+esc(item.title)+'</dd><dt>Name</dt><dd>'+esc(name.value.trim())+'</dd><dt>Email</dt><dd>'+esc(em)+'</dd><dt>'+esc(B.dateLabel)+'</dt><dd>'+esc(when)+'</dd><dt>'+esc(B.quantityLabel)+'</dt><dd>'+n()+'</dd><dt>Total</dt><dd>'+money(item.price*n())+'</dd></dl><p class="demo-note">'+esc(B.confirmation)+'</p><button type="button" class="btn btn-ghost btn-sm" data-close-confirm><span>Close</span></button></div>';
        form.outerHTML=conf;var c=body.querySelector('[data-confirm]');c.focus();c.querySelector('[data-close-confirm]').addEventListener('click',closeDlg);
      });
    }
    colRoot.addEventListener('click',function(e){var b=e.target.closest('[data-open-item]');if(!b||!dlg)return;var item=find(b.getAttribute('data-open-item'));if(!item)return;opener=b;body.innerHTML=render(item);wireForm(item);if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');document.body.style.overflow='hidden';var close=dlg.querySelector('[data-close-modal]');if(close)close.focus();});
    syncFavs();apply();
  })();}

  /* Contact form: CSRF token + friendly status */
  fetch('admin/csrf.php').then(function(r){return r.json();}).then(function(d){document.querySelectorAll('[name="_csrf"]').forEach(function(i){i.value=d.token||'';});}).catch(function(){});
  document.querySelectorAll('[data-form]').forEach(function(form){form.addEventListener('submit',function(){var note=form.querySelector('[data-form-note]');if(note)note.textContent='Sending your message…';});});
  var sent=location.search.match(/[?&]sent=([01])/);if(sent){document.querySelectorAll('[data-form-note]').forEach(function(n){n.textContent=sent[1]==='1'?'Thank you, your message has been sent. We will be in touch soon.':'Sorry, your message could not be sent. Please check the form and try again, or contact us by phone or email.';});}

  /* Back to top */
  document.querySelectorAll('[data-to-top]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();window.scrollTo({top:0,behavior:reduce?'auto':'smooth'});});});
})();
`;
}
