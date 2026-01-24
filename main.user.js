// ==UserScript==
// @name         rouletteboxd
// @namespace    http://tampermonkey.net/
// @version      7.3.0
// @description  don't know what to watch? press r to roll.
// @author       kewwwal
// @match        https://letterboxd.com/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=letterboxd.com
// @run-at       document-idle
// @license      MIT
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const MAX_RETRY = 3;
  const MAX_REDIR = 15;

  window.ROULETTE = {
    active: false,
    spin: false,
    timer: null,
    img: null,
    src: null
  };

  const SEL = "roulette-highlight";
  const ACT = "roulette-mode-active";
  const PARAM = "auto_spin";
  const KEY = "roulette_retry";
  const ID = "roulette-winner-overlay";

  const url = new URL(window.location.href);
  let auto = false;
  if (url.searchParams.has(PARAM)) {
      auto = true;
      url.searchParams.delete(PARAM);
      window.history.replaceState({}, document.title, url.toString());
  } else {
      sessionStorage.setItem(KEY, "0");
  }

  function isInput(el) {
    if (!el) return false;
    const t = ["INPUT", "TEXTAREA", "SELECT"];
    return t.includes(el.tagName) || el.isContentEditable;
  }

  function setMode(on) {
      if (on) document.body.classList.add(ACT);
      else document.body.classList.remove(ACT);
  }

  function mark(el) {
    if (el) el.classList.add(SEL);
  }

  function unmark() {
    document.querySelectorAll("." + SEL).forEach(el => el.classList.remove(SEL));
  }

  function getPoster(el) {
      const imgs = el.getElementsByTagName('img');
      let img = null;
      for (let i of imgs) {
          if (i.width < 40 || i.classList.contains('avatar')) continue;
          if (i.src && i.src.includes('empty-poster')) continue;
          img = i; break;
      }
      let src = null;
      if (img) {
          src = img.currentSrc || img.src;
          if (!src && img.srcset) {
               const p = img.srcset.split(',');
               src = p[p.length - 1].trim().split(' ')[0];
          }
      }
      if (!src) {
          const div = el.querySelector('div[data-poster-url]');
          if (div) {
              const p = div.getAttribute('data-poster-url');
              if(p && p.startsWith('http')) src = p;
          }
      }
      return { src, el: img };
  }

  function bigUrl(src) {
      if (!src) return null;
      const c = src.split('?')[0];
      if (c.match(/-0-\d+-0-\d+/)) {
          return c.replace(/-0-\d+-0-\d+/, '-0-460-0-690');
      }
      return c;
  }

  function parseTime(iso) {
      if (!iso) return "";
      let min = 0;
      if (iso.match(/PT(\d+)M/)) {
          min = parseInt(iso.match(/PT(\d+)M/)[1]);
      } else if (iso.includes('H')) {
          const hM = iso.match(/(\d+)H/);
          const mM = iso.match(/(\d+)M/);
          const h = hM ? parseInt(hM[1]) : 0;
          const m = mM ? parseInt(mM[1]) : 0;
          min = (h * 60) + m;
      }
      if (min > 0) {
          const h = Math.floor(min / 60);
          const m = min % 60;
          if (h > 0) return `${h}h ${m}m`;
          return `${m}m`;
      }
      return "";
  }

  function css() {
    if (document.getElementById("roulette-style")) return;

    const noise = `url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MDAiIGhlaWdodD0iNDAwIj48ZmlsdGVyIGlkPSJhIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii44NSIgb2N0YXZlcz0iMyIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PC9maWx0ZXI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsdGVyPSJ1cmwoI2EpIiBvcGFjaXR5PSIwLjEiLz48L3N2Zz4=')`;

    const txt = `
      li.${SEL} .poster,
      div.${SEL} .poster {
        opacity: 1 !important;
        outline: 4px solid #00e054 !important;
        outline-offset: -1px !important;
        box-shadow: 0 0 30px rgba(0, 224, 84, 0.4) !important;
        z-index: 9998;
        transform: scale(1.05);
      }
      body.${ACT} .poster-list li:not(.${SEL}) .poster,
      body.${ACT} .griditem:not(.${SEL}) .poster,
      body.${ACT} li.film-detail:not(.${SEL}) .poster {
        opacity: 0.3 !important;
        transition: opacity 0.2s linear;
      }
      #${ID} {
          position: fixed; top: 0; left: 0; width: 100%; height: 100%;
          background-color: rgba(16, 20, 24, 0.94);
          backdrop-filter: blur(14px);
          z-index: 10000;
          display: flex; flex-direction: column;
          justify-content: center; align-items: center;
          opacity: 0; animation: f 0.4s forwards;
          text-align: center; font-family: 'Graphik', Helvetica, Arial, sans-serif;
          overflow: hidden;
      }
      #${ID}::before {
          content: ""; position: absolute;
          top: -100%; left: -100%; width: 300%; height: 300%;
          background-image: ${noise}; opacity: 0.05;
          pointer-events: none; animation: n 8s steps(10) infinite; z-index: -1;
      }
      @keyframes n { 0%, 100% { transform: translate(0, 0); } 10% { transform: translate(-5%, -10%); } 50% { transform: translate(-15%, 10%); } 90% { transform: translate(-10%, 10%); } }
      @keyframes f { to { opacity: 1; } }
      .r-close {
          position: absolute; top: 30px; right: 40px; font-size: 40px; color: #9ab;
          cursor: pointer; transition: color 0.2s; z-index: 10001; font-weight: 300; line-height: 1;
      }
      .r-close:hover { color: #fff; }
      .p-box { perspective: 1200px; margin-bottom: 30px; z-index: 1; padding: 20px; }
      #${ID} .c-post {
          height: 55vh; max-width: 80vw;
          object-fit: contain; border-radius: 4px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.6);
          border: 1px solid rgba(255,255,255,0.15);
          background: #14181c;
          transition: transform 0.1s cubic-bezier(0.2, 0, 0.2, 1), box-shadow 0.1s ease-out;
          transform-style: preserve-3d;
          animation: p 0.6s cubic-bezier(0.19, 1, 0.22, 1) forwards;
      }
      @keyframes p { from { transform: scale(0.9) translateY(20px); opacity:0; } to { transform: scale(1) translateY(0); opacity:1; } }
      #${ID} .c-info {
          opacity: 0; animation: s 0.5s ease-out forwards; animation-delay: 0.2s;
          color: #fff; max-width: 800px; padding: 0 20px; z-index: 1;
      }
      @keyframes s { from { transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      #${ID} h1 {
          font-family: 'Tiempos Headline', Georgia, serif; font-size: 2.8em; font-weight: 700;
          margin: 0 0 8px 0; line-height: 1.1; color: #ffffff; letter-spacing: -0.01em;
      }
      #${ID} .meta {
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 1.15em;
          color: #ccddee; font-weight: 400; margin-bottom: 6px; text-transform: uppercase;
          letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center;
          gap: 10px; flex-wrap: wrap;
      }
      #${ID} .meta span.sep { color: #445566; font-size: 0.8em; }
      #${ID} .rate { color: #00e054; font-weight: 500; display: inline-flex; align-items: center; }
      #${ID} .star { color: #00e054; font-size: 1.35em; margin-right: 4px; line-height: 1; position: relative; top: -1px; }
      #${ID} .gen {
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 0.95em;
          color: #778899; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 30px;
      }
      #${ID} .act-btn {
          padding: 16px 50px; background: #00e054; color: #ffffff !important;
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 14px;
          font-weight: 700; border-radius: 3px; text-decoration: none; text-transform: uppercase;
          letter-spacing: 0.12em; transition: all 0.2s ease; display: inline-block;
          cursor: pointer; border: none; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      }
      #${ID} .act-btn:hover {
          background: #00d04f; color: #ffffff !important; box-shadow: 0 6px 25px rgba(0, 0, 0, 0.35);
      }
      .hint {
          margin-top: 25px; font-size: 0.75em; color: rgba(255, 255, 255, 0.3); font-weight: 500;
          letter-spacing: 0.1em; cursor: pointer; transition: color 0.3s; text-transform: uppercase;
      }
      .hint:hover { color: rgba(255, 255, 255, 0.8); }
    `;

    const s = document.createElement("style");
    s.id = "roulette-style";
    s.textContent = txt;
    (document.head || document.documentElement).appendChild(s);
  }

  function getLink(el) {
      const a = el.querySelector('a[href^="/film/"]');
      if (a) return a.href;
      const d = el.querySelector('div[data-item-link]');
      if (d) return "https://letterboxd.com" + d.getAttribute('data-item-link');
      return null;
  }

  async function fetchUrl(u, n = 0) {
      try {
          const r = await fetch(u);
          if (!r.ok) throw new Error('HTTP Error');
          const t = await r.text();
          return new DOMParser().parseFromString(t, 'text/html');
      } catch (e) {
          if (n < MAX_RETRY) {
              await new Promise(r => setTimeout(r, 500));
              return fetchUrl(u, n + 1);
          }
          throw e;
      }
  }

  async function getMeta(u) {
      let d = { dir: "", rate: "", year: "", date: null, time: "", gen: "" };
      try {
          const doc = await fetchUrl(u);
          const jLd = doc.querySelector('script[type="application/ld+json"]');
          let j = null;
          if (jLd) { try { j = JSON.parse(jLd.textContent); } catch(e){} }

          if (j && j.genre) {
              const g = Array.isArray(j.genre) ? j.genre : [j.genre];
              d.gen = g.slice(0, 3).join(" / ");
          }
          if (!d.gen) {
              const l = doc.querySelectorAll('.text-sluglist.capitalize a.text-slug[href*="/films/genre/"]');
              if (l && l.length > 0) d.gen = Array.from(l).slice(0, 3).map(a => a.innerText).join(" / ");
          }

          if (j && j.datePublished) {
              d.year = j.datePublished.substring(0, 4);
              d.date = j.datePublished;
          } else {
              const y = doc.querySelector('.film-header .releaseyear a');
              if (y) d.year = y.innerText;
          }

          if (j && j.director) {
              const ds = Array.isArray(j.director) ? j.director : [j.director];
              d.dir = ds.map(o => o.name).join(", ");
          } else {
              const m = doc.querySelector('meta[name="twitter:data1"]');
              if (m) d.dir = m.content;
          }

          if (j && j.aggregateRating && j.aggregateRating.ratingValue) {
              d.rate = parseFloat(j.aggregateRating.ratingValue).toFixed(1);
          } else {
              const m = doc.querySelector('meta[name="twitter:data2"]');
              if (m && m.content) {
                  const x = m.content.match(/^([\d.]+)/);
                  if (x) d.rate = parseFloat(x[1]).toFixed(1);
              }
          }

          if (j && j.duration) d.time = parseTime(j.duration);
          if (!d.time) {
              const f = doc.querySelector('.text-footer');
              if (f) {
                  const x = f.innerText.match(/(\d+)\s+mins/);
                  if (x) {
                      const m = parseInt(x[1]);
                      const h = Math.floor(m / 60);
                      const mm = m % 60;
                      d.time = (h > 0) ? `${h}h ${mm}m` : `${mm}m`;
                  }
              }
          }
      } catch (e) { console.warn("Meta fail:", e); }
      return d;
  }

  async function check(el) {
      const l = getLink(el);
      const m = l ? await getMeta(l) : {dir:"", rate:"", year:"", date: null, time:"", gen:""};

      if (m.date) {
          const rel = new Date(m.date);
          const now = new Date();
          rel.setHours(0,0,0,0);
          now.setHours(0,0,0,0);
          if (rel > now) {
              console.warn(`Unreleased. Rerrolling...`);
              run();
              return;
          }
      }
      show(el, m);
  }

  function close() {
      const o = document.getElementById(ID);
      if (o) o.remove();
      unmark();
      setMode(false);
      window.ROULETTE.spin = false;
      if (window.ROULETTE.timer) clearTimeout(window.ROULETTE.timer);
      window.ROULETTE.img = null;
      window.ROULETTE.src = null;
      sessionStorage.setItem(KEY, "0");
  }

  function err(t) {
      const o = document.createElement('div');
      o.id = ID;
      document.body.appendChild(o);

      const c = document.createElement('div');
      c.className = "r-close";
      c.textContent = "×";
      o.appendChild(c);

      const i = document.createElement('div');
      i.className = "c-info";
      o.appendChild(i);

      const h = document.createElement('h1');
      h.style.color = "#ff5050";
      h.textContent = "⚠️ Error";
      i.appendChild(h);

      const p = document.createElement('p');
      p.style.cssText = "font-size:1.2em; color:#fff; margin-bottom:20px;";
      p.textContent = t;
      i.appendChild(p);

      const b = document.createElement('div');
      b.className = "act-btn";
      b.textContent = "TRY AGAIN";
      i.appendChild(b);

      c.onclick = close;
      b.onclick = () => { close(); run(); };
  }

  function mkBtn(p) {
      const b = document.createElement('div');
      b.className = "r-close";
      b.textContent = "×";
      b.setAttribute("role", "button");
      b.setAttribute("tabindex", "0");
      b.setAttribute("aria-label", "Close");
      b.onclick = close;
      b.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); close(); }};
      p.appendChild(b);
  }

  function mkPost(p, s) {
      const c = document.createElement('div');
      c.className = "p-box";
      const i = document.createElement('img');
      i.src = s;
      i.className = "c-post";
      i.alt = "Winner";
      c.appendChild(i);
      p.appendChild(c);
      i.onerror = function() {
          this.src = window.ROULETTE.src;
          this.style.transform = "none";
          this.onerror = null;
      };
      return { c, i };
  }

  function mkInfo(p, t, m, l) {
      const d = document.createElement('div');
      d.className = "c-info";
      p.appendChild(d);

      const h = document.createElement('h1');
      h.textContent = t;
      d.appendChild(h);

      const md = document.createElement('div');
      md.className = "meta";
      d.appendChild(md);

      const span = (x, c) => {
          const s = document.createElement('span');
          if (c) s.className = c;
          s.textContent = x;
          return s;
      };

      const arr = [];
      if (m.dispYear) arr.push(span(m.dispYear));
      if (m.time) arr.push(span(m.time));
      if (m.dir) arr.push(span(`DIRECTED BY ${m.dir.toUpperCase()}`));

      const rBox = document.createElement('span');
      rBox.className = "rate";
      rBox.setAttribute("aria-label", `Rating: ${m.rate}`);
      const st = document.createElement('span');
      st.className = "star";
      st.textContent = "★";
      rBox.appendChild(st);
      rBox.appendChild(document.createTextNode(m.rate || "NO RATING"));
      arr.push(rBox);

      arr.forEach((x, k) => {
          md.appendChild(x);
          if (k < arr.length - 1) md.appendChild(span("•", "sep"));
      });

      if (m.gen) {
          const g = document.createElement('div');
          g.className = "gen";
          g.textContent = m.gen.toUpperCase();
          d.appendChild(g);
      }

      const a = document.createElement('a');
      a.href = l || "#";
      a.className = "act-btn";
      a.textContent = "DIVE IN";
      a.setAttribute("role", "button");
      d.appendChild(a);
      setTimeout(() => a.focus(), 100);

      const re = document.createElement('div');
      re.className = "hint";
      re.textContent = "Press R to Reroll";
      re.setAttribute("role", "button");
      re.setAttribute("tabindex", "0");
      re.onclick = () => { close(); run(); };
      re.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); close(); run(); }};
      d.appendChild(re);
  }

  function tilt(c, i) {
      if (!c || !i) return;
      c.addEventListener('mousemove', (e) => {
          const r = c.getBoundingClientRect();
          const x = e.clientX - r.left;
          const y = e.clientY - r.top;
          const rx = ((y - r.height / 2) / (r.height / 2)) * -8;
          const ry = ((x - r.width / 2) / (r.width / 2)) * 8;
          i.style.transform = `scale(1.08) rotateX(${rx}deg) rotateY(${ry}deg)`;
          i.style.boxShadow = `0 35px 70px rgba(0,0,0,0.9)`;
      });
      c.addEventListener('mouseleave', () => {
          i.style.transform = 'scale(1) rotateX(0) rotateY(0)';
          i.style.boxShadow = `0 10px 40px rgba(0,0,0,0.6)`;
      });
  }

  function show(el, m) {
      unmark();
      const pd = getPoster(el);
      const s1 = pd.src || "https://s.ltrbxd.com/static/img/empty-poster-230.png";
      window.ROULETTE.src = s1;

      let fin = s1;
      if (window.ROULETTE.img && window.ROULETTE.img.complete && window.ROULETTE.img.naturalWidth > 0) {
          fin = window.ROULETTE.img.src;
      } else {
          const h = bigUrl(s1);
          if (h) fin = h;
      }

      let t = "Unknown";
      if (pd.el && pd.el.alt) t = pd.el.alt;
      t = t.replace(/^Poster for\s+/i, '');

      let dispYear = m.year;
      const ym = t.match(/\((\d{4})\)$/);
      if (ym) {
          dispYear = ym[1];
          t = t.replace(/\s\(\d{4}\)$/, '');
      }

      const um = { ...m, dispYear };
      const l = getLink(el);

      const o = document.createElement('div');
      o.id = ID;
      document.body.appendChild(o);

      mkBtn(o);
      const { c, i } = mkPost(o, fin);
      mkInfo(o, t, um, l);
      tilt(c, i);
  }

  function count() {
    const i = document.querySelectorAll('.paginate-pages li.paginate-page');
    return i.length > 0 ? (parseInt(i[i.length - 1].innerText, 10) || 1) : 1;
  }

  function curr() {
    const m = window.location.pathname.match(/\/page\/(\d+)\//);
    return m ? parseInt(m[1], 10) : 1;
  }

  function go(n) {
    let p = window.location.pathname;
    if (p.includes("/page/")) p = p.replace(/\/page\/\d+\//, `/page/${n}/`);
    else {
        if (!p.endsWith("/")) p += "/";
        p += `page/${n}/`;
    }
    const u = new URL(window.location.protocol + "//" + window.location.host + p + window.location.search);
    u.searchParams.set(PARAM, "1");
    window.location.href = u.toString();
  }

  function list() {
    let ps = Array.from(document.querySelectorAll('div.film-poster')).map(d => d.closest('li')).filter(e => e);
    if (document.body.classList.contains("hide-films-seen")) {
      ps = ps.filter(e => !e.querySelector('.film-poster[data-watched="true"]') && !e.classList.contains("film-watched"));
    }
    const y = new Date().getFullYear();
    return ps.filter(e => {
        const d = getPoster(e);
        let my = null;
        if (d.el && d.el.alt) {
            const m = d.el.alt.match(/\((\d{4})\)$/);
            if (m) my = parseInt(m[1], 10);
        }
        return !(my && my > y);
    });
  }

  function run() {
      if(document.getElementById(ID)) close();
      const tot = count();
      const cur = curr();
      const tar = Math.floor(Math.random() * tot) + 1;
      console.log(`Target: ${tar}/${tot}`);
      if (tar !== cur) go(tar);
      else spin();
  }

  function spin() {
    if (window.ROULETTE.spin) return;
    let rc = parseInt(sessionStorage.getItem(KEY) || "0", 10);
    css();
    setMode(true);
    window.ROULETTE.active = true;

    const ps = list();
    if (ps.length === 0) {
        setMode(false);
        if (rc >= MAX_REDIR) {
            sessionStorage.setItem(KEY, "0");
            err("No films found.");
            return;
        }
        sessionStorage.setItem(KEY, (rc + 1).toString());
        if (count() > 1) run();
        else err("Empty page.");
        return;
    }

    sessionStorage.setItem(KEY, "0");
    window.ROULETTE.spin = true;

    const winIdx = Math.floor(Math.random() * ps.length);
    const winEl = ps[winIdx];

    const pd = getPoster(winEl);
    const h = bigUrl(pd.src);
    if (h) {
        window.ROULETTE.img = new Image();
        window.ROULETTE.img.src = h;
    }

    let step = 0;
    const steps = Math.floor(Math.random() * 10) + 20;
    let d = 35;

    function next() {
        if (!window.ROULETTE.spin) return;
        unmark();
        let p;
        if (step >= steps) p = winIdx;
        else p = Math.floor(Math.random() * ps.length);

        const el = ps[p];
        if (el) {
            mark(el);
            const b = (step >= steps - 5) ? "smooth" : "auto";
            const bl = (step >= steps - 5) ? "center" : "nearest";
            el.scrollIntoView({ behavior: b, block: bl, inline: "center" });
        }

        if (step < steps) {
            step++;
            d = Math.floor(d * 1.12);
            window.ROULETTE.timer = setTimeout(next, d);
        } else {
            window.ROULETTE.spin = false;
            check(winEl);
        }
    }
    next();
  }

  function wait() {
      let tId = null;
      const o = new MutationObserver((m, obs) => {
          if (list().length > 0) {
              obs.disconnect();
              if (tId) clearTimeout(tId);
              spin();
          }
      });
      o.observe(document.body, { childList: true, subtree: true });
      if (list().length > 0) {
          o.disconnect();
          spin();
      } else {
          tId = setTimeout(() => { o.disconnect(); spin(); }, 10000);
      }
  }

  if (auto) wait();

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (isInput(document.activeElement)) return;
      run();
    }
    if (e.code === "Escape") close();
  });
})();