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

  function esc(t){return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}
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

  /* Contact form: CSRF token + friendly status */
  fetch('admin/csrf.php').then(function(r){return r.json();}).then(function(d){document.querySelectorAll('[name="_csrf"]').forEach(function(i){i.value=d.token||'';});}).catch(function(){});
  document.querySelectorAll('[data-form]').forEach(function(form){form.addEventListener('submit',function(){var note=form.querySelector('[data-form-note]');if(note)note.textContent='Sending your message…';});});
  var sent=location.search.match(/[?&]sent=([01])/);if(sent){document.querySelectorAll('[data-form-note]').forEach(function(n){n.textContent=sent[1]==='1'?'Thank you, your message has been sent. We will be in touch soon.':'Sorry, your message could not be sent. Please check the form and try again, or contact us by phone or email.';});}

  /* Back to top */
  document.querySelectorAll('[data-to-top]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();window.scrollTo({top:0,behavior:reduce?'auto':'smooth'});});});
})();
`;
}
