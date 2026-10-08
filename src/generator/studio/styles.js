// Stylesheet builder for the studio engine. One shared, well-structured base plus
// per-direction personality, all driven by CSS custom properties (OKLCH only).

import { paletteVars } from './palette.js';

export function buildCss({ direction, directionId, palette }) {
  const d = direction;
  const f = d.fonts;
  const light = paletteVars(palette.light);
  const dark = paletteVars(palette.dark);
  const defaultDark = palette.defaultMode === 'dark';
  return `/* Generated design system: ${d.name} */
:root{${defaultDark ? dark : light};--font-display:"${f.display}",Georgia,serif;--font-body:"${f.body}",system-ui,-apple-system,"Segoe UI",sans-serif;--display-weight:${f.displayWeight};--display-tracking:${d.displayTracking};--display-leading:${d.displayLeading};--display-stretch:${d.displayStretch || '100%'};--r-sm:${d.radius.sm};--r-md:${d.radius.md};--r-lg:${d.radius.lg};--r-pill:${d.radius.pill};--ease:cubic-bezier(.22,1,.36,1);--ease-in-out:cubic-bezier(.65,0,.35,1);--fs-xs:clamp(.8rem,.77rem + .1vw,.86rem);--fs-sm:clamp(.9rem,.86rem + .15vw,.98rem);--fs-base:clamp(1rem,.97rem + .18vw,1.1rem);--fs-lg:clamp(1.15rem,1.05rem + .45vw,1.4rem);--fs-h3:clamp(1.25rem,1.1rem + .6vw,1.65rem);--fs-h2:clamp(2rem,1.45rem + 2.3vw,3.5rem);--fs-display:clamp(${(2.6 * d.displayScale).toFixed(2)}rem,${(1.6 * d.displayScale).toFixed(2)}rem + ${(4.2 * d.displayScale).toFixed(2)}vw,${(5.6 * d.displayScale).toFixed(2)}rem);--fs-xl:clamp(${(3 * d.displayScale).toFixed(2)}rem,${(1.6 * d.displayScale).toFixed(2)}rem + ${(6.4 * d.displayScale).toFixed(2)}vw,${(8.4 * d.displayScale).toFixed(2)}rem);--gutter:clamp(1.1rem,4vw,3rem);--section:clamp(4.5rem,10vw,9rem);--max:1240px;--header-h:76px}
[data-theme="light"]{${light}}
[data-theme="dark"]{${dark}}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--font-body);font-size:var(--fs-base);line-height:1.65;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;overflow-x:hidden;transition:background-color .5s var(--ease),color .5s var(--ease)}
img{display:block;max-width:100%;height:auto}
a{color:inherit;text-underline-offset:.22em;text-decoration-thickness:1px}
p{margin:0 0 1em;max-width:68ch}
h1,h2,h3{margin:0;font-family:var(--font-display);font-weight:var(--display-weight);letter-spacing:var(--display-tracking);font-stretch:var(--display-stretch);line-height:1.08;text-wrap:balance}
h3{font-size:var(--fs-h3);line-height:1.2}
ul,ol{padding:0;margin:0;list-style:none}
:focus-visible{outline:2px solid var(--primary-text);outline-offset:3px;border-radius:2px}
.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.skip-link{position:absolute;left:1rem;top:-4rem;z-index:100;background:var(--primary);color:var(--on-primary);padding:.6rem 1rem;border-radius:var(--r-sm)}.skip-link:focus{top:1rem}
.container{width:min(var(--max),100% - var(--gutter) * 2);margin-inline:auto}
.section{padding-block:var(--section);position:relative}
.muted{color:var(--muted)}
.display{font-size:var(--fs-display);line-height:var(--display-leading)}
.display-xl{font-size:var(--fs-xl);line-height:calc(var(--display-leading) * .96)}
.h2{font-size:var(--fs-h2)}
.h3{font-size:var(--fs-h3)}
.lede{font-size:var(--fs-lg);color:var(--muted);max-width:52ch}
.kicker{display:inline-flex;align-items:center;gap:.6rem;margin:0 0 1.1rem;font-size:var(--fs-sm);font-weight:600;color:var(--primary-text)}
.kicker::before{content:"";width:1.8rem;height:1px;background:currentColor}
.center{justify-content:center;text-align:center}
.center-stack{display:grid;justify-items:center;text-align:center;gap:1.4rem}
.ico{width:1.6rem;height:1.6rem;flex:none}.ico-sm{width:1.1rem;height:1.1rem;vertical-align:-.18em}.ico-flip{transform:scaleX(-1)}
.price{font-weight:700;color:var(--primary-text);margin:.6rem 0 0}

/* Buttons */
.btn{--bx:0px;--by:0px;position:relative;display:inline-flex;align-items:center;gap:.6rem;padding:.95rem 1.5rem;border-radius:var(--r-pill);font-weight:600;font-size:var(--fs-sm);text-decoration:none;border:1px solid transparent;cursor:pointer;font-family:inherit;line-height:1.2;isolation:isolate;overflow:hidden;transform:translate(var(--bx),var(--by));transition:transform .35s var(--ease),background-color .3s,color .3s,border-color .3s,box-shadow .3s}
.btn::after{content:"";position:absolute;inset:0;z-index:-1;background:var(--accent);transform:translateY(101%);transition:transform .45s var(--ease)}
.btn:hover::after{transform:translateY(0)}
.btn-primary{background:var(--primary);color:var(--on-primary);box-shadow:0 10px 30px -12px var(--glow)}
.btn-primary:hover{color:var(--on-accent)}
.btn-ghost{background:transparent;color:var(--ink);border-color:var(--line-strong)}
.btn-ghost:hover{color:var(--on-accent);border-color:var(--accent)}
.btn-light{background:oklch(99% 0 0);color:oklch(20% 0.02 260)}
.btn-light::after{background:var(--accent)}
.btn-outline-light{color:oklch(99% 0 0);border-color:oklch(99% 0 0 / .6);background:transparent}
.btn-outline-light::after{background:oklch(99% 0 0 / .15)}
.btn-sm{padding:.7rem 1.15rem}
.btn-ico{width:1.05rem;height:1.05rem;transition:transform .35s var(--ease)}
.btn:hover .btn-ico{transform:translateX(4px)}
.hero-actions{display:flex;flex-wrap:wrap;gap:.8rem;margin-top:2rem}

/* Header */
.site-header{position:fixed;inset:0 0 auto;z-index:50;transition:transform .45s var(--ease),background-color .35s,box-shadow .35s,color .35s}
.header-inner{width:min(var(--max),100% - var(--gutter) * 2);margin-inline:auto;height:var(--header-h);display:flex;align-items:center;gap:2rem}
.site-header.is-scrolled{background:color-mix(in oklch,var(--bg) 82%,transparent);backdrop-filter:blur(14px) saturate(1.4);-webkit-backdrop-filter:blur(14px) saturate(1.4);box-shadow:0 1px 0 var(--line)}
.site-header.is-hidden{transform:translateY(-100%)}
.brand{display:inline-flex;align-items:center;gap:.7rem;text-decoration:none;font-family:var(--font-display);font-weight:var(--display-weight);font-size:1.2rem;letter-spacing:-.01em;white-space:nowrap}
.brand-mark{display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:var(--r-md);background:var(--primary);color:var(--on-primary);font-size:.95rem;font-family:var(--font-body);font-weight:700;letter-spacing:.02em}
.brand-logo{height:44px;width:auto}
.site-nav{display:flex;gap:1.6rem;margin-left:auto;font-size:var(--fs-sm);font-weight:500}
.site-nav a{white-space:nowrap;position:relative;text-decoration:none;padding:.4rem 0;opacity:.86;transition:opacity .2s}
.site-nav a::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1.5px;background:currentColor;transform:scaleX(0);transform-origin:right;transition:transform .4s var(--ease)}
.site-nav a:hover,.site-nav a[aria-current="page"]{opacity:1}
.site-nav a:hover::after,.site-nav a[aria-current="page"]::after{transform:scaleX(1);transform-origin:left}
.header-actions{display:flex;align-items:center;gap:.6rem}
.theme-toggle,.menu-toggle{display:grid;place-items:center;width:2.6rem;height:2.6rem;border-radius:var(--r-pill);border:1px solid var(--line-strong);background:transparent;color:inherit;cursor:pointer;transition:transform .4s var(--ease),background-color .3s}
.theme-toggle:hover{transform:rotate(90deg)}
.theme-toggle .ico{width:1.2rem;height:1.2rem}
.menu-toggle{display:none;gap:5px;align-content:center}
.menu-toggle span:not(.sr-only){display:block;width:18px;height:1.5px;background:currentColor;transition:transform .4s var(--ease)}
.menu-open .menu-toggle span:nth-child(1){transform:translateY(3.25px) rotate(45deg)}
.menu-open .menu-toggle span:nth-child(2){transform:translateY(-3.25px) rotate(-45deg)}
.has-overlay-hero .site-header:not(.is-scrolled){color:oklch(99% 0 0)}
.has-overlay-hero .site-header:not(.is-scrolled) .theme-toggle,.has-overlay-hero .site-header:not(.is-scrolled) .menu-toggle{border-color:oklch(99% 0 0 / .45)}
.mobile-menu{position:fixed;inset:0;z-index:45;background:var(--deep);color:var(--on-deep);display:flex;flex-direction:column;justify-content:center;padding:calc(var(--header-h) + 2rem) var(--gutter) 2rem;clip-path:circle(0% at calc(100% - 3rem) 2.5rem);transition:clip-path .7s var(--ease-in-out)}
.mobile-menu[hidden]{display:flex!important;visibility:hidden}
.menu-open .mobile-menu{clip-path:circle(150% at calc(100% - 3rem) 2.5rem);visibility:visible}
.mobile-menu nav{display:grid;gap:.4rem}
.mobile-menu nav a{font-family:var(--font-display);font-size:clamp(2rem,9vw,3.4rem);text-decoration:none;line-height:1.15;opacity:0;transform:translateY(24px);transition:opacity .5s var(--ease),transform .6s var(--ease);transition-delay:calc(.2s + var(--i) * .06s)}
.menu-open .mobile-menu nav a{opacity:1;transform:none}
.mobile-menu-foot{display:grid;gap:.3rem;margin-top:2.5rem;opacity:.8}
.menu-open .site-header{color:var(--on-deep)}

/* Scroll progress, preloader, cursor */
.scroll-progress{position:fixed;top:0;left:0;height:3px;width:100%;z-index:60;background:linear-gradient(90deg,var(--primary),var(--accent));transform-origin:left;transform:scaleX(var(--progress,0))}
.preloader{display:none}.js-motion .preloader{position:fixed;inset:0;z-index:90;display:grid;place-items:center;background:var(--deep);color:var(--on-deep);transition:clip-path .9s var(--ease-in-out) .15s;clip-path:inset(0 0 0 0)}
.preloader span{font-family:var(--font-display);font-size:clamp(1.6rem,5vw,3rem);overflow:hidden;display:block}
.preloader span i{display:block;font-style:normal;animation:rise .8s var(--ease) both}
.js-motion.is-loaded .preloader{clip-path:inset(0 0 100% 0)}
.cursor-glow{position:fixed;left:0;top:0;width:420px;height:420px;margin:-210px 0 0 -210px;border-radius:50%;pointer-events:none;z-index:1;background:radial-gradient(circle,var(--glow),transparent 65%);opacity:.5;mix-blend-mode:screen;transform:translate(var(--cx,-999px),var(--cy,-999px));transition:transform .5s var(--ease)}
.grain::after{content:"";position:fixed;inset:-50%;z-index:80;pointer-events:none;opacity:.06;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)'/%3E%3C/svg%3E");animation:grain 1s steps(4) infinite}

/* Hero shared */
.hero{position:relative;padding:calc(var(--header-h) + clamp(3rem,8vw,6rem)) 0 clamp(3.5rem,8vw,6.5rem);overflow:hidden}
.hero-grid{display:grid;gap:clamp(2.5rem,6vw,5rem);align-items:center}
.hero-copy .lede{margin-top:1.6rem}
.hero-call{margin-top:1.4rem;color:var(--muted);font-size:var(--fs-sm)}
.hero-call a{color:var(--ink);font-weight:600}
.cover{width:100%;height:100%;object-fit:cover}
.media-frame{border-radius:var(--r-lg);overflow:hidden;aspect-ratio:4/5;box-shadow:0 40px 80px -40px oklch(20% 0.05 260 / .45);transform-style:preserve-3d}
.hero-media{position:relative;margin:0}
.hero-chips{position:absolute;inset:auto -1rem -1.5rem auto;display:grid;gap:.6rem}
.chip{display:grid;gap:.1rem;padding:.8rem 1.1rem;border-radius:var(--r-md);background:color-mix(in oklch,var(--surface) 88%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);box-shadow:0 20px 40px -20px oklch(20% 0.04 260 / .35);border:1px solid var(--line);min-width:11rem}
.chip strong{font-family:var(--font-display);font-size:1.4rem;line-height:1.1;color:var(--primary-text)}
.chip span{font-size:var(--fs-xs);color:var(--muted)}
.chip:nth-child(2){margin-right:3rem}
.hero-chips-row{position:static;display:flex;flex-wrap:wrap;margin-top:3rem;gap:.8rem}
.hero-chips-row .chip{margin:0}
.blob{position:absolute;border-radius:42% 58% 63% 37%/45% 41% 59% 55%;filter:blur(2px);opacity:.55;pointer-events:none;animation:morph 14s ease-in-out infinite alternate}
.blob-a{width:38vw;height:38vw;max-width:520px;max-height:520px;right:-8vw;top:-6vw;background:var(--primary-soft)}
.blob-b{width:24vw;height:24vw;left:-6vw;bottom:-4vw;background:var(--accent-soft);animation-duration:18s}
.blob-c{width:280px;height:280px;right:-60px;top:-80px;background:var(--accent-soft)}

/* Hero: full-bleed parallax */
.hero-fullbleed{min-height:100svh;display:flex;align-items:flex-end;color:oklch(99% 0 0)}
.hero-bg{position:absolute;inset:0;overflow:hidden}
.hero-bg-inner{position:absolute;inset:-12% 0;will-change:transform}
.hero-scrim,.band-scrim{position:absolute;inset:0;background:linear-gradient(180deg,oklch(15% 0.02 260 / .35) 0%,oklch(15% 0.02 260 / .2) 40%,oklch(12% 0.02 260 / .78) 100%)}
.hero-fullbleed-inner{position:relative;z-index:2}
.hero-fullbleed .lede,.hero-fullbleed .hero-call,.hero-fullbleed .hero-call a,.hero-fullbleed .kicker{color:oklch(96% 0.01 260)}
.hero-fullbleed .btn-ghost{color:oklch(99% 0 0);border-color:oklch(99% 0 0 / .55)}
.hero-fullbleed .chip{background:oklch(99% 0 0 / .14);border-color:oklch(99% 0 0 / .25);color:oklch(99% 0 0)}
.hero-fullbleed .chip strong{color:oklch(99% 0 0)}.hero-fullbleed .chip span{color:oklch(92% 0.01 260)}
.scroll-cue{position:absolute;left:50%;bottom:1.6rem;z-index:2;width:26px;height:42px;margin-left:-13px;border:1.5px solid oklch(99% 0 0 / .7);border-radius:20px}
.scroll-cue span{position:absolute;left:50%;top:8px;width:4px;height:8px;margin-left:-2px;border-radius:2px;background:oklch(99% 0 0);animation:cue 1.8s var(--ease) infinite}

/* Hero: kinetic */
.hero-kinetic .display-xl{max-width:14ch}
.kinetic-row{display:grid;gap:2rem;margin-top:2.4rem;align-items:end}
.kinetic-media{position:relative;margin:clamp(2.5rem,6vw,4.5rem) auto 0;width:min(var(--max),100% - var(--gutter) * 2);aspect-ratio:21/9;border-radius:var(--r-lg);overflow:hidden}
.kinetic-img{position:absolute;inset:-10% 0}
.kinetic-media .hero-chips{inset:auto 1.2rem 1.2rem auto}
.marquee-hero{margin-top:3rem}

/* Hero: editorial */
.editorial-top{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;flex-wrap:wrap;margin-bottom:1.2rem}
.editorial-meta{color:var(--muted);font-size:var(--fs-sm);margin:0}
.editorial-figure{margin:clamp(2rem,5vw,3.5rem) 0 0;height:clamp(320px,62vh,720px);overflow:hidden;position:relative}
.editorial-img{position:absolute;inset:-14% 0}
.editorial-foot{display:grid;gap:1.5rem;margin-top:2.5rem;align-items:start}

/* Hero: collage */
.collage{position:relative;aspect-ratio:1/1.05}
.collage figure{position:absolute;margin:0;overflow:hidden;border-radius:var(--r-lg);box-shadow:0 30px 60px -30px oklch(20% 0.05 260 / .45)}
.collage-a{inset:0 18% 22% 0}
.collage-b{width:44%;aspect-ratio:1;right:0;top:10%}
.collage-c{width:52%;aspect-ratio:4/3;right:6%;bottom:0}
.collage-chips{inset:auto auto 6% -2%}

/* Hero: aurora */
.hero-aurora{text-align:center;min-height:100svh}
.hero-aurora-inner{position:relative;z-index:2;display:grid;justify-items:center}
.hero-aurora .display-xl{max-width:16ch}
.hero-aurora .lede{margin:1.6rem auto 0}
.aurora{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.aurora span{position:absolute;width:60vw;height:60vw;border-radius:50%;filter:blur(80px);opacity:.55;animation:drift 20s ease-in-out infinite alternate}
.aurora span:nth-child(1){background:var(--primary);left:-10vw;top:-20vw}
.aurora span:nth-child(2){background:var(--accent);right:-15vw;top:-5vw;animation-duration:26s}
.aurora span:nth-child(3){background:color-mix(in oklch,var(--primary),var(--accent));left:20vw;bottom:-35vw;animation-duration:32s}
.aurora-soft span{opacity:.3}
.grid-lines{position:absolute;inset:0;background-image:linear-gradient(var(--line) 1px,transparent 1px),linear-gradient(90deg,var(--line) 1px,transparent 1px);background-size:64px 64px;mask-image:radial-gradient(ellipse at 50% 30%,black,transparent 70%);-webkit-mask-image:radial-gradient(ellipse at 50% 30%,black,transparent 70%)}
.glass-panel{margin-top:4rem;width:min(1000px,100%);padding:.8rem;border-radius:var(--r-lg);background:color-mix(in oklch,var(--surface) 55%,transparent);border:1px solid var(--line-strong);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);box-shadow:0 40px 120px -40px var(--glow)}
.glass-media{border-radius:calc(var(--r-lg) - .5rem);overflow:hidden;aspect-ratio:16/8}
.glass-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;padding:1.4rem 1rem .6rem;text-align:left}
.glass-stats strong{font-family:var(--font-display);font-size:1.8rem;display:block}
.glass-stats span{color:var(--muted);font-size:var(--fs-sm)}

/* Marquee */
.marquee{overflow:hidden;border-block:1px solid var(--line);padding-block:1.1rem;--speed:38s}
.marquee-track{display:flex;width:max-content;animation:marquee var(--speed) linear infinite}
.marquee-track>div{display:flex;align-items:center;gap:2.2rem;padding-right:2.2rem}
.marquee span{font-family:var(--font-display);font-size:clamp(1.3rem,1rem + 1.4vw,2.2rem);white-space:nowrap}
.marquee i{font-style:normal;color:var(--accent)}
.marquee{position:relative}.marquee:hover .marquee-track,.marquee.is-paused .marquee-track{animation-play-state:paused}.marquee-toggle{position:absolute;right:.6rem;top:50%;width:1.8rem;height:1.8rem;margin-top:-.9rem;border-radius:50%;border:1px solid currentColor;background:transparent;color:inherit;opacity:.5;cursor:pointer;display:grid;place-items:center;padding:0}.marquee-toggle:hover,.marquee-toggle:focus-visible{opacity:1}.marquee-toggle span{width:8px;height:9px;border-left:2.5px solid currentColor;border-right:2.5px solid currentColor}.marquee.is-paused .marquee-toggle span{width:0;height:0;border:0;border-left:8px solid currentColor;border-top:5px solid transparent;border-bottom:5px solid transparent}.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}.slider-dots .slider-pause{margin-left:auto;background:none;border:1px solid var(--line-strong);border-radius:var(--r-pill);color:var(--ink);font:inherit;font-size:var(--fs-xs);padding:.3rem .8rem;cursor:pointer;width:auto;height:auto}
.marquee-giant{border:0;--speed:30s}
.marquee-giant span{font-size:clamp(3rem,2rem + 6vw,7.5rem);line-height:1}

/* Proof */
.proof{padding-block:clamp(2.5rem,5vw,4rem);border-bottom:1px solid var(--line)}
.proof-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:1.5rem}
.proof-item strong{display:block;font-family:var(--font-display);font-size:clamp(2.2rem,1.6rem + 2vw,3.4rem);line-height:1;color:var(--primary-text);font-weight:var(--display-weight)}
.proof-item>span{display:block;margin-top:.5rem;color:var(--muted);font-size:var(--fs-sm)}

/* Section heads */
.section-head{max-width:46rem;margin-bottom:clamp(2.5rem,5vw,4rem)}
.section-intro{margin-top:1.2rem;color:var(--muted);font-size:var(--fs-lg)}

/* Services: bento */
.bento{display:grid;gap:1rem}
.bento-item{position:relative;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);overflow:hidden;display:flex;flex-direction:column;transition:border-color .3s,transform .5s var(--ease);transform-style:preserve-3d}
.bento-item:hover{border-color:var(--primary)}
.bento-body{padding:clamp(1.4rem,3vw,2rem);display:grid;gap:.6rem;align-content:start}
.bento-body .ico{color:var(--primary-text)}
.bento-body p{color:var(--muted);margin:0}
.bento-img{aspect-ratio:16/10;overflow:hidden}
.bento-img img{transition:transform 1.2s var(--ease)}
.bento-feature:hover .bento-img img{transform:scale(1.06)}
.bento-feature{background:var(--deep);color:var(--on-deep);border:0}
.bento-feature .bento-body p,.bento-feature .ico{color:color-mix(in oklch,var(--on-deep) 80%,transparent)}
.bento-feature .price{color:var(--accent)}

/* Services: cards */
.card-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:1rem}
.svc-card{padding:1.8rem;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);transition:transform .5s var(--ease),box-shadow .5s var(--ease);transform-style:preserve-3d}
.svc-card:hover{box-shadow:0 30px 60px -35px var(--glow)}
.svc-icon{display:inline-grid;place-items:center;width:3.2rem;height:3.2rem;border-radius:var(--r-md);background:var(--primary-soft);color:var(--primary-text);margin-bottom:1.2rem;transition:transform .5s var(--ease)}
.svc-card:hover .svc-icon{transform:rotate(-8deg) scale(1.08)}
.svc-card h3{margin-bottom:.6rem}
.svc-card p{color:var(--muted);margin:0}

/* Services: hover list */
.hover-list{position:relative;border-top:1px solid var(--line)}
.hover-row{display:grid;grid-template-columns:1fr;gap:.4rem;padding:1.6rem 0;border-bottom:1px solid var(--line);text-decoration:none;position:relative;z-index:2;transition:padding .45s var(--ease),color .3s}
.hover-title{font-family:var(--font-display);font-size:clamp(1.6rem,1.2rem + 1.6vw,2.6rem);line-height:1.1;font-weight:var(--display-weight)}
.hover-desc{color:var(--muted);max-width:52ch}
.hover-meta{color:var(--primary-text);font-weight:600}
.hover-row:hover{padding-left:1rem}
.hover-preview{position:fixed;left:0;top:0;width:300px;aspect-ratio:4/5;border-radius:var(--r-md);overflow:hidden;pointer-events:none;z-index:3;opacity:0;transform:translate(var(--hx,0),var(--hy,0)) scale(.85);transition:opacity .3s,transform .5s var(--ease)}
.hover-list.is-hovering .hover-preview{opacity:1;transform:translate(var(--hx,0),var(--hy,0)) scale(1)}

/* Services: tabs */
.tabs{display:grid;gap:2rem}
.tab-list{display:flex;flex-wrap:wrap;gap:.5rem}
.tab-list button{font:inherit;font-size:var(--fs-sm);font-weight:600;padding:.7rem 1.2rem;border-radius:var(--r-pill);border:1px solid var(--line-strong);background:transparent;color:var(--ink);cursor:pointer;transition:background-color .3s,color .3s,border-color .3s}
.tab-list button[aria-selected="true"]{background:var(--primary);color:var(--on-primary);border-color:var(--primary)}
.tab-panel{display:grid;gap:2rem;align-items:center;animation:fadeUp .6s var(--ease)}
.tab-media{border-radius:var(--r-lg);overflow:hidden;aspect-ratio:4/3}
.tab-copy{display:grid;gap:1rem;justify-items:start}
.tab-copy .ico{color:var(--primary-text);width:2.2rem;height:2.2rem}
.tab-copy h3{font-size:var(--fs-h2)}
.tab-copy p{color:var(--muted);font-size:var(--fs-lg)}

/* Services: carousel */
.carousel{position:relative}
.carousel-track{display:grid;grid-auto-flow:column;grid-auto-columns:min(340px,82%);gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:1rem;scrollbar-width:none;cursor:grab}
.carousel-track::-webkit-scrollbar{display:none}
.carousel-track.is-dragging{cursor:grabbing;scroll-snap-type:none}
.carousel-card{scroll-snap-align:start;padding:2rem;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);display:grid;gap:.8rem;align-content:start;min-height:280px}
.carousel-card:nth-child(3n+1){background:var(--primary);color:var(--on-primary);border-color:transparent}
.carousel-card:nth-child(3n+1) p{color:inherit;opacity:.85}
.carousel-card:nth-child(3n+1) .price{color:inherit}
.carousel-card p{color:var(--muted);margin:0}
.carousel-num .ico{width:2rem;height:2rem}
.carousel-nav{display:flex;gap:.6rem;margin-top:1.4rem}
.carousel-nav button{width:3rem;height:3rem;border-radius:var(--r-pill);border:1px solid var(--line-strong);background:transparent;color:var(--ink);cursor:pointer;display:grid;place-items:center;transition:background-color .3s,color .3s}
.carousel-nav button:hover{background:var(--primary);color:var(--on-primary)}

/* About */
.about-grid{display:grid;gap:clamp(2.5rem,6vw,5rem);align-items:center}
.about-media{position:relative;margin:0}
.about-img{position:relative;aspect-ratio:4/5;border-radius:var(--r-lg);overflow:hidden}
.about-img img{position:absolute;inset:-10% 0;height:120%}
.about-badge{position:absolute;right:-1rem;bottom:2rem;display:inline-flex;gap:.5rem;align-items:center;padding:.9rem 1.2rem;border-radius:var(--r-pill);background:var(--accent);color:var(--on-accent);font-weight:600;font-size:var(--fs-sm);box-shadow:0 20px 40px -20px oklch(20% 0.05 260 / .4)}
.about-copy p{color:var(--muted);font-size:var(--fs-lg);margin-top:1.4rem}
.benefit-list{display:grid;gap:1.4rem;margin-top:2rem}
.benefit-list li{display:flex;gap:1rem;align-items:flex-start}
.benefit-list .ico{color:var(--primary-text);margin-top:.2rem}
.benefit-list h3{font-size:1.15rem;font-family:var(--font-body);font-weight:700;letter-spacing:0}
.benefit-list p{margin:.3rem 0 0;font-size:var(--fs-base)}
.statement{font-family:var(--font-display);font-size:clamp(1.8rem,1.2rem + 2.6vw,3.6rem);line-height:1.18;letter-spacing:var(--display-tracking);max-width:30ch;font-weight:var(--display-weight)}
.statement .sw{opacity:.18;transition:opacity .3s}
.statement .sw.on{opacity:1}
.statement-foot{display:grid;gap:2rem;margin-top:clamp(3rem,6vw,5rem);align-items:end}
.statement-img{margin:0;aspect-ratio:3/2;border-radius:var(--r-lg);overflow:hidden;position:relative}
.statement-img>div{position:absolute;inset:-10% 0}
.statement-copy p{color:var(--muted)}
.statement-copy h2{margin-bottom:1rem}
.benefit-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:2rem;margin-top:clamp(3rem,6vw,5rem);padding-top:2.5rem;border-top:1px solid var(--line)}
.benefit .ico{color:var(--primary-text);margin-bottom:1rem}
.benefit h3{font-size:1.2rem;margin-bottom:.5rem}
.benefit p{color:var(--muted);margin:0}

/* Parallax band */
.band,.cta-image{position:relative;min-height:clamp(420px,70vh,720px);display:flex;align-items:center;overflow:hidden;color:oklch(99% 0 0)}
.band-bg,.cta-image-bg{position:absolute;inset:0;overflow:hidden}
.band-bg>div,.cta-image-bg>div{position:absolute;inset:-18% 0}
.band-inner,.cta-image-inner{position:relative;z-index:2;display:grid;gap:2rem;justify-items:start}
.band-quote{font-family:var(--font-display);font-size:clamp(2rem,1.3rem + 3vw,4.2rem);line-height:1.1;max-width:22ch;margin:0;font-weight:var(--display-weight);letter-spacing:var(--display-tracking)}
.cta-image .lede{color:oklch(94% 0.01 260)}

/* Process */
.process-grid{display:grid;gap:3rem}
.process-sticky{align-self:start}
.timeline{position:relative;display:grid;gap:2.6rem;padding-left:3.4rem}
.timeline::before,.timeline-fill{content:"";position:absolute;left:1.15rem;top:.5rem;bottom:.5rem;width:2px;background:var(--line)}
.timeline-fill{background:var(--primary);transform-origin:top;transform:scaleY(var(--fill,0));transition:transform .2s linear}
.timeline li{position:relative}
.step-dot{position:absolute;left:-3.4rem;top:-.1rem;display:grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:50%;background:var(--bg);border:2px solid var(--primary);color:var(--primary-text);font-weight:700;font-size:var(--fs-sm)}
.timeline h3{margin-bottom:.4rem}
.timeline p{color:var(--muted);margin:0}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.2rem;counter-reset:none}
.steps li{padding:2rem;border-radius:var(--r-lg);background:var(--surface-2);position:relative;overflow:hidden}
.step-num{display:block;font-family:var(--font-display);font-size:4rem;line-height:1;color:var(--primary-text);opacity:.9;margin-bottom:1.2rem}
.steps h3{margin-bottom:.5rem}
.steps p{color:var(--muted);margin:0}

/* Team */
.team-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1.2rem}
.person{padding:1.8rem;border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);transition:transform .5s var(--ease),box-shadow .5s;transform-style:preserve-3d}
.person:hover{box-shadow:0 30px 60px -35px var(--glow)}
.person-avatar{width:4.4rem;height:4.4rem;border-radius:50%;display:grid;place-items:center;margin-bottom:1.3rem;background:conic-gradient(from calc(var(--h) * 1deg),var(--primary),var(--accent),var(--primary));padding:3px}
.person-avatar span{display:grid;place-items:center;width:100%;height:100%;border-radius:50%;background:var(--surface);font-weight:700;color:var(--primary-text)}
.role{color:var(--primary-text);font-weight:600;margin:.3rem 0 .8rem}
.person p:last-child{color:var(--muted);margin-bottom:0}

/* Pricing */
.pricing-grid{display:grid;gap:3rem;align-items:start}
.price-list{margin:0;border-top:1px solid var(--line-strong)}
.price-row{display:flex;justify-content:space-between;gap:1.5rem;padding:1.3rem 0;border-bottom:1px solid var(--line);transition:padding .35s var(--ease),background-color .35s}
.price-row:hover{padding-inline:.8rem;background:var(--primary-soft)}
.price-row dt{font-weight:600}
.price-row dt small{display:block;font-weight:400;color:var(--muted);font-size:var(--fs-sm);margin-top:.2rem}
.price-row dd{margin:0;font-family:var(--font-display);font-size:1.35rem;color:var(--primary-text);white-space:nowrap}

/* Gallery */
.ba-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1.2rem}
.ba{margin:0}
.ba-frame{position:relative;aspect-ratio:4/3;border-radius:var(--r-lg);overflow:hidden;--pos:50%;user-select:none}
.ba-before,.ba-after{position:absolute;inset:0}
.ba-after{clip-path:inset(0 0 0 var(--pos))}
.ba-dim{filter:grayscale(.6) brightness(.85)}
.ba-range{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:ew-resize;margin:0;z-index:3}
.ba-handle{position:absolute;top:0;bottom:0;left:var(--pos);width:2px;margin-left:-1px;background:oklch(99% 0 0);z-index:2;pointer-events:none}
.ba-handle::after{content:"";position:absolute;top:50%;left:50%;width:2.6rem;height:2.6rem;margin:-1.3rem 0 0 -1.3rem;border-radius:50%;background:oklch(99% 0 0);box-shadow:0 6px 20px oklch(20% 0.05 260 / .35)}
.ba-tag{position:absolute;top:.8rem;z-index:2;padding:.3rem .7rem;border-radius:var(--r-pill);background:oklch(15% 0.02 260 / .6);color:oklch(99% 0 0);font-size:var(--fs-xs);font-weight:600}
.ba-tag-l{left:.8rem}.ba-tag-r{right:.8rem}
.ba figcaption{margin-top:.8rem;font-weight:600}
.masonry{columns:3 240px;column-gap:1rem}
.masonry-item{display:block;margin-bottom:1rem;border-radius:var(--r-md);overflow:hidden;break-inside:avoid}
.masonry-item img{transition:transform 1s var(--ease)}
.masonry-item:hover img{transform:scale(1.05)}
.masonry-item:nth-child(2n) img{aspect-ratio:3/4}
.lightbox{position:fixed;inset:0;z-index:95;display:grid;place-items:center;background:oklch(10% 0.01 260 / .88);padding:2rem;opacity:0;transition:opacity .35s}
.lightbox.is-open{opacity:1}
.lightbox img{max-height:86vh;width:auto;border-radius:var(--r-md);transform:scale(.94);transition:transform .45s var(--ease)}
.lightbox.is-open img{transform:none}

/* Quotes */
.quote-slider{position:relative;min-height:12rem}
.quote{margin:0;position:absolute;inset:0 0 auto;opacity:0;transform:translateY(20px);transition:opacity .6s var(--ease),transform .6s var(--ease);pointer-events:none}
.quote.is-active{position:relative;opacity:1;transform:none;pointer-events:auto}
.quote p{font-family:var(--font-display);font-size:clamp(1.5rem,1.1rem + 1.6vw,2.6rem);line-height:1.25;max-width:32ch}
.quote cite{font-style:normal;color:var(--muted);font-weight:600}
.slider-dots{display:flex;gap:.5rem;margin-top:2rem}
.slider-dots button{width:2.4rem;height:4px;border-radius:2px;border:0;background:var(--line-strong);cursor:pointer;padding:0}
.slider-dots button[aria-current="true"]{background:var(--primary)}

/* FAQ */
.faq-grid{display:grid;gap:2.5rem}
.acc-item{border-bottom:1px solid var(--line)}
.acc-q{width:100%;display:flex;justify-content:space-between;align-items:center;gap:1rem;padding:1.4rem 0;background:none;border:0;color:inherit;font:inherit;font-size:var(--fs-lg);font-weight:600;text-align:left;cursor:pointer}
.acc-ico{width:1.4rem;height:1.4rem;flex:none;transition:transform .45s var(--ease);color:var(--primary-text)}
.acc-q[aria-expanded="true"] .acc-ico{transform:rotate(135deg)}
.acc-a p{color:var(--muted);padding-bottom:1.4rem;margin:0}

/* CTA */
.cta{position:relative;padding-block:var(--section);overflow:hidden}
.cta-bigtype .display-xl{max-width:16ch}
.cta-row{display:grid;gap:2rem;margin-top:2.5rem;align-items:center}
.cta-image-inner .display{max-width:18ch}
.soft-panel{position:relative;overflow:hidden;text-align:center;display:grid;justify-items:center;gap:1.2rem;padding:clamp(3rem,7vw,6rem) clamp(1.5rem,5vw,4rem);border-radius:var(--r-lg);background:var(--deep);color:var(--on-deep)}
.soft-panel .lede{color:color-mix(in oklch,var(--on-deep) 80%,transparent)}
.soft-panel .btn-ghost{color:var(--on-deep);border-color:color-mix(in oklch,var(--on-deep) 40%,transparent)}
.cta-aurora .display{max-width:18ch}
.cta-marquee .center-stack{margin-top:2rem}

/* Contact */
.contact{background:var(--surface-2)}
.contact-grid{display:grid;gap:3rem;align-items:start}
.contact-list{display:grid;gap:1.4rem}
.contact-list li{display:flex;gap:1rem;align-items:flex-start}
.contact-list .ico{color:var(--primary-text)}
.contact-list strong{display:block;font-size:var(--fs-sm);color:var(--muted);font-weight:600}
.contact-list a,.contact-list span{font-size:var(--fs-lg);font-weight:500}
.contact-form{display:grid;gap:1rem;padding:clamp(1.5rem,4vw,2.5rem);border-radius:var(--r-lg);background:var(--surface);border:1px solid var(--line);box-shadow:0 30px 80px -50px oklch(20% 0.05 260 / .5)}
.field-row{display:grid;gap:1rem}
.contact-form label{display:grid;gap:.45rem;font-size:var(--fs-sm);font-weight:600}
.contact-form input,.contact-form textarea,.contact-form select{font:inherit;font-weight:400;padding:.9rem 1rem;border-radius:var(--r-md);border:1px solid var(--line-strong);background:var(--bg);color:var(--ink);transition:border-color .25s,box-shadow .25s}
.contact-form input:focus,.contact-form textarea:focus,.contact-form select:focus{outline:0;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}
.contact-form .btn{justify-content:center}
.form-note{min-height:1.4em;margin:0}
.map-wrap{margin-top:3rem;border-radius:var(--r-lg);overflow:hidden;border:1px solid var(--line)}
.map-wrap iframe{display:block;width:100%;height:clamp(280px,40vw,440px);border:0;filter:saturate(.85)}

/* Inner pages */
.page-hero{position:relative;padding:calc(var(--header-h) + clamp(3rem,7vw,5.5rem)) 0 clamp(3rem,6vw,5rem);overflow:hidden;background:var(--surface-2)}
.page-hero-grid{position:relative;z-index:2;display:grid;gap:3rem;align-items:center}
.page-hero .lede{margin-top:1.4rem}
.crumbs{display:flex;gap:.6rem;margin-bottom:1.4rem;font-size:var(--fs-sm);color:var(--muted)}
.crumbs a{text-decoration:none}
.page-hero-img{margin:0;aspect-ratio:4/3;border-radius:var(--r-lg);overflow:hidden;position:relative}
.page-hero-img>div{position:absolute;inset:-10% 0}
.page-body .container{display:grid;gap:clamp(3rem,7vw,6rem)}
.feature-row{display:grid;gap:2rem;align-items:center}
.feature-img{margin:0;aspect-ratio:4/3;border-radius:var(--r-lg);overflow:hidden;position:relative}
.feature-img>div{position:absolute;inset:-8% 0}
.feature-copy p{color:var(--muted);font-size:var(--fs-lg);margin-top:1rem}
.ticks{display:grid;gap:.7rem;margin-top:1.2rem}
.ticks li{display:flex;gap:.7rem;align-items:flex-start}
.ticks .ico-sm{color:var(--primary-text);margin-top:.3rem}
.prose{max-width:70ch}
.prose h2{font-size:var(--fs-h3);margin:2rem 0 .8rem}
.prose p,.prose li{color:var(--muted)}

/* Footer */
.site-footer{position:relative;background:var(--deep);color:var(--on-deep);padding-top:clamp(4rem,8vw,6rem);overflow:hidden}
.site-footer .muted{color:color-mix(in oklch,var(--on-deep) 70%,transparent)}
.footer-grid{display:grid;gap:2.5rem}
.footer-title{font-family:var(--font-display);font-size:clamp(1.8rem,1.4rem + 1.5vw,2.6rem);line-height:1.1;margin-bottom:1rem;font-weight:var(--display-weight)}
.footer-brand .btn{margin-top:1rem}
.footer-label{font-weight:700;margin-bottom:1rem}
.footer-nav{display:grid;gap:.5rem}
.footer-nav a,.site-footer a{text-decoration:none;opacity:.85}
.footer-nav a:hover,.site-footer a:hover{opacity:1;text-decoration:underline}
.site-footer p{margin:0 0 .4rem}
.footer-giant{margin-top:4rem;overflow:hidden;white-space:nowrap;line-height:.8}
.footer-giant span{display:block;font-family:var(--font-display);font-weight:var(--display-weight);font-size:clamp(4rem,15vw,15rem);letter-spacing:-.04em;color:color-mix(in oklch,var(--on-deep) 12%,transparent)}
.footer-base{display:flex;flex-wrap:wrap;justify-content:space-between;gap:1rem;padding-block:2rem;margin-top:3rem;border-top:1px solid color-mix(in oklch,var(--on-deep) 18%,transparent);font-size:var(--fs-sm)}

/* Reveal system (only active once the runtime has started) */
.js-motion [data-reveal]{opacity:0;transition:opacity .9s var(--ease),transform 1s var(--ease),clip-path 1.2s var(--ease-in-out);transition-delay:var(--d,0s)}
.js-motion [data-reveal="up"]{transform:translateY(40px)}
.js-motion [data-reveal="left"]{transform:translateX(-40px)}
.js-motion [data-reveal="scale"]{transform:scale(.94)}
.js-motion [data-reveal="clip"]{opacity:1;clip-path:inset(12% 12% 12% 12% round var(--r-lg))}
.js-motion [data-reveal].is-in{opacity:1;transform:none}.js-motion [data-reveal="clip"].is-in{clip-path:inset(0 0 0 0 round var(--r-lg))}
.js-motion [data-reveal="clip"] img{transform:scale(1.18);transition:transform 1.6s var(--ease)}
.js-motion [data-reveal="clip"].is-in img{transform:scale(1)}
.split-w{display:inline-block;overflow:hidden;vertical-align:top;padding-bottom:.08em;margin-bottom:-.08em}
.split-w>span{display:inline-block;transform:translateY(105%);transition:transform 1s var(--ease);transition-delay:calc(var(--wi) * .05s + var(--d,0s))}
.is-in .split-w>span,.split-w.is-in>span{transform:none}
[data-float]{animation:float 6s ease-in-out infinite;animation-delay:calc(var(--i,0) * -1.6s)}
[data-parallax]{will-change:transform}

/* Keyframes */
@keyframes marquee{to{transform:translateX(-50%)}}
@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
@keyframes morph{0%{border-radius:42% 58% 63% 37%/45% 41% 59% 55%;transform:rotate(0)}100%{border-radius:58% 42% 37% 63%/55% 59% 41% 45%;transform:rotate(25deg) scale(1.08)}}
@keyframes drift{0%{transform:translate(0,0) scale(1)}100%{transform:translate(8vw,6vw) scale(1.2)}}
@keyframes cue{0%{opacity:0;transform:translateY(0)}40%{opacity:1}100%{opacity:0;transform:translateY(14px)}}
@keyframes rise{from{transform:translateY(110%)}to{transform:none}}
@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes grain{0%{transform:translate(0,0)}25%{transform:translate(-5%,4%)}50%{transform:translate(4%,-6%)}75%{transform:translate(-3%,-2%)}100%{transform:translate(2%,5%)}}

/* Direction personality */
${directionCss(directionId)}

/* Responsive */
@media(min-width:768px){.hero-grid{grid-template-columns:1.05fr .95fr}.hero-collage .hero-grid{grid-template-columns:1fr 1fr}.kinetic-row{grid-template-columns:1.2fr 1fr}.editorial-foot{grid-template-columns:1.3fr 1fr}.bento{grid-template-columns:repeat(3,1fr);grid-auto-rows:minmax(220px,auto)}.bento-feature{grid-column:span 2;grid-row:span 2}.bento-feature .bento-img{flex:1;aspect-ratio:auto;min-height:260px}.hover-row{grid-template-columns:1.1fr 1.4fr auto;align-items:center;gap:2rem}.tab-panel{grid-template-columns:1.1fr 1fr}.about-grid{grid-template-columns:.9fr 1.1fr}.statement-foot{grid-template-columns:1fr 1fr}.process-grid{grid-template-columns:.8fr 1.2fr;gap:5rem}.process-sticky{position:sticky;top:calc(var(--header-h) + 2rem)}.pricing-grid{grid-template-columns:.8fr 1.2fr;gap:5rem}.faq-grid{grid-template-columns:.8fr 1.2fr;gap:5rem}.cta-row{grid-template-columns:1fr auto}.contact-grid{grid-template-columns:.9fr 1.1fr;gap:5rem}.field-row{grid-template-columns:1fr 1fr}.page-hero-grid{grid-template-columns:1.1fr .9fr}.feature-row{grid-template-columns:1fr 1fr;gap:clamp(2.5rem,6vw,6rem)}.feature-row.flip .feature-img{order:2}.footer-grid{grid-template-columns:1.5fr 1fr 1fr}}
@media(max-width:1023px){.site-nav{display:none}.menu-toggle{display:grid}}
.nav-overlay .site-nav{display:none}.nav-overlay .menu-toggle{display:grid}
@media(min-width:1024px) and (max-width:1279px){.nav-dense .site-nav{display:none}.nav-dense .menu-toggle{display:grid}}
@media(max-width:767px){:root{--header-h:66px}.header-cta{display:none}.theme-toggle{width:2.3rem;height:2.3rem}.hero-chips{position:static;display:flex;flex-wrap:wrap;margin-top:1.2rem}.chip:nth-child(2){margin-right:0}.media-frame{aspect-ratio:4/4.4}.collage{aspect-ratio:1/1.15}.kinetic-media{aspect-ratio:4/3}.kinetic-media .hero-chips{display:none}.about-badge{right:.6rem}.hover-preview{display:none}.price-row dd{font-size:1.15rem}.footer-giant span{font-size:22vw}.hero-fullbleed{min-height:92svh}.btn{padding:.9rem 1.25rem}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}[data-parallax]{transform:none!important}}
`;
}

function directionCss(id) {
  const map = {
    atelier: `.kicker::before{width:2.6rem}.btn{border-radius:var(--r-pill);letter-spacing:.02em}.section-head .h2,.display{font-style:normal}.hero-editorial .display-xl{max-width:13ch}.proof-item strong{font-style:italic}.statement{font-style:italic}.bento-item,.svc-card,.person{border-radius:var(--r-sm)}`,
    serene: `.btn{box-shadow:0 14px 34px -14px var(--glow)}.section-head{margin-inline:auto;text-align:center}.section-head .kicker{justify-content:center}.section-head .section-intro{margin-inline:auto}.services .section-head,.team .section-head,.process-steps .section-head{max-width:40rem}.kicker::before{width:.6rem;height:.6rem;border-radius:50%;background:var(--accent)}.contact .section-head,.faq .section-head,.pricing .section-head,.process-timeline .section-head{text-align:left;margin-inline:0}.contact .section-head .kicker,.faq .section-head .kicker,.pricing .section-head .kicker,.process-timeline .section-head .kicker{justify-content:flex-start}.steps li{background:var(--surface);border:1px solid var(--line)}`,
    kinetic: `.display,.display-xl,.h2{text-transform:none}.kicker{font-weight:800}.kicker::before{width:.9rem;height:.9rem;background:var(--accent);border-radius:50%}.btn{text-transform:none;font-weight:700}.proof{background:var(--primary);color:var(--on-primary);border:0}.proof-item strong{color:var(--on-primary)}.proof-item>span{color:var(--on-primary);opacity:.85}.bento-item,.svc-card,.carousel-card{border-width:2px;border-color:var(--ink)}.marquee{background:var(--accent);color:var(--on-accent);border:0}.marquee i{color:var(--on-accent)}.cta-bigtype{background:var(--deep);color:var(--on-deep)}.cta-bigtype .lede{color:color-mix(in oklch,var(--on-deep) 80%,transparent)}`,
    noir: `.kicker{letter-spacing:.06em}.kicker::before{background:var(--accent)}.btn-primary{background:var(--accent);color:var(--on-accent)}.btn-primary::after{background:oklch(99% 0 0)}.btn-primary:hover{color:oklch(18% 0.02 260)}.proof-item strong,.price-row dd,.chip strong,.step-num{color:var(--accent-text)}.display,.h2{font-style:normal}.statement{font-style:italic}.site-footer{background:oklch(9% 0.01 260);color:oklch(94% 0.01 260)}.contact{background:var(--surface)}.page-hero{background:var(--surface)}`,
    aurora: `.kicker{padding:.4rem .9rem;border-radius:var(--r-pill);border:1px solid var(--line-strong);background:color-mix(in oklch,var(--surface) 60%,transparent)}.kicker::before{width:.5rem;height:.5rem;border-radius:50%;background:var(--accent);box-shadow:0 0 12px var(--accent)}.bento-item,.svc-card,.person,.contact-form{background:color-mix(in oklch,var(--surface) 70%,transparent);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}.bento-feature{background:linear-gradient(140deg,var(--primary),color-mix(in oklch,var(--primary),var(--accent)));color:var(--on-primary)}.btn-primary{background:linear-gradient(120deg,var(--primary),color-mix(in oklch,var(--primary),var(--accent) 45%))}.display-xl,.display{background:linear-gradient(180deg,var(--ink) 30%,color-mix(in oklch,var(--ink),var(--primary) 45%));-webkit-background-clip:text;background-clip:text;color:transparent;padding-bottom:.08em}`,
    craft: `.kicker::before{content:"✺";width:auto;height:auto;background:none;color:var(--accent)}.media-frame,.collage figure{border:6px solid var(--surface);box-shadow:0 30px 60px -30px oklch(25% 0.05 50 / .45)}.collage-b{transform:rotate(4deg)}.collage-c{transform:rotate(-3deg)}.chip{transform:rotate(-2deg)}.about-badge{border-radius:50%;width:8.5rem;height:8.5rem;display:grid;place-items:center;text-align:center;padding:1rem;transform:rotate(-8deg)}.svc-card:nth-child(odd){transform:rotate(-.6deg)}.svc-card:nth-child(even){transform:rotate(.6deg)}.svc-card:hover{transform:rotate(0) translateY(-6px)}.marquee{background:var(--primary);color:var(--on-primary);border:0}.marquee i{color:var(--accent)}`,
    swiss: `.kicker{font-weight:700}.kicker::before{width:.7rem;height:.7rem;background:var(--primary)}.section-head{border-top:2px solid var(--ink);padding-top:1.4rem;max-width:none;display:grid;gap:1rem}.bento-item,.svc-card,.person,.contact-form,.steps li{border-radius:0}.steps li{border-top:3px solid var(--primary);background:transparent;padding-inline:0}.btn{border-radius:var(--r-pill)}.hover-title{letter-spacing:-.03em}.proof{border-top:2px solid var(--ink)}`,
    pop: `.btn{font-weight:700;box-shadow:4px 4px 0 var(--ink)}.btn:hover{transform:translate(-2px,-2px);box-shadow:6px 6px 0 var(--ink)}.svc-card,.bento-item,.person,.steps li,.contact-form{border:2px solid var(--ink);box-shadow:6px 6px 0 var(--ink)}.svc-card:nth-child(4n+1) .svc-icon{background:var(--accent);color:var(--on-accent)}.chip{border:2px solid var(--ink);box-shadow:4px 4px 0 var(--ink)}.kicker::before{width:.8rem;height:.8rem;border-radius:4px;background:var(--accent);transform:rotate(45deg)}.marquee{background:var(--ink);color:var(--bg);border:0}`
  };
  return map[id] || '';
}
