// ==UserScript==
// @name         rouletteboxd
// @namespace    https://github.com/kewwwal/
// @version      7.4
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

  const CONFIG = {
    MAX_RETRY: 3,
    SEL_CLASS: "roulette-highlight",
    ACT_CLASS: "roulette-mode-active",
    OVERLAY_ID: "roulette-overlay",
    STYLE_ID: "roulette-style",
    FALLBACK_IMG: "https://a.ltrbxd.com/resized/film-poster/1/4/5/6/3/4/6/1456346-the-original-story-of-zafer-uzegul-0-1000-0-1500-crop.jpg",
    TIMEOUT_FALLBACK: 0
  };

  window.ROULETTE = {
    active: false,
    spin: false,
    timer: null,
    img: null,
    src: null,
    ready: false,
    currentMarked: null
  };

  function isInput(el) {
    if (!el) return false;
    const inputTags = ["INPUT", "TEXTAREA", "SELECT"];
    return inputTags.includes(el.tagName) || el.isContentEditable;
  }

  function setMode(on) {
      if (on) document.body.classList.add(CONFIG.ACT_CLASS);
      else document.body.classList.remove(CONFIG.ACT_CLASS);
  }

  function mark(el) {
    if (el) {
        el.classList.add(CONFIG.SEL_CLASS);
        window.ROULETTE.currentMarked = el;
    }
  }

  function unmark() {
    if (window.ROULETTE.currentMarked) {
        window.ROULETTE.currentMarked.classList.remove(CONFIG.SEL_CLASS);
        window.ROULETTE.currentMarked = null;
    } else {
        document.querySelectorAll("." + CONFIG.SEL_CLASS).forEach(el => el.classList.remove(CONFIG.SEL_CLASS));
    }
  }

  function getPosterData(el) {
      const images = el.getElementsByTagName('img');
      let imgElement = null;
      for (let img of images) {
          if (img.width < 40 || img.classList.contains('avatar')) continue;
          if (img.src && img.src.includes('empty-poster')) continue;
          imgElement = img; break;
      }
      let src = null;
      if (imgElement) {
          src = imgElement.currentSrc || imgElement.src;
          if (!src && imgElement.srcset) {
               const parts = imgElement.srcset.split(',');
               src = parts[parts.length - 1].trim().split(' ')[0];
          }
      }
      if (!src) {
          const posterDiv = el.querySelector('div[data-poster-url]');
          if (posterDiv) {
              const url = posterDiv.getAttribute('data-poster-url');
              if(url && url.startsWith('http')) src = url;
          }
      }
      return { src, el: imgElement };
  }

  function getHighResUrl(src) {
      if (!src) return null;
      const cleanSrc = src.split('?')[0];
      if (cleanSrc.match(/-0-\d+-0-\d+/)) {
          return cleanSrc.replace(/-0-\d+-0-\d+/, '-0-460-0-690');
      }
      return cleanSrc;
  }

  function parseDuration(isoString) {
      if (!isoString) return "";
      let totalMinutes = 0;
      if (isoString.match(/PT(\d+)M/)) {
          totalMinutes = parseInt(isoString.match(/PT(\d+)M/)[1]);
      } else if (isoString.includes('H')) {
          const hoursMatch = isoString.match(/(\d+)H/);
          const minutesMatch = isoString.match(/(\d+)M/);
          const hours = hoursMatch ? parseInt(hoursMatch[1]) : 0;
          const minutes = minutesMatch ? parseInt(minutesMatch[1]) : 0;
          totalMinutes = (hours * 60) + minutes;
      }
      if (totalMinutes > 0) {
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          if (hours > 0) return `${hours}h ${minutes}m`;
          return `${minutes}m`;
      }
      return "";
  }

  function injectStyles() {
    if (document.getElementById(CONFIG.STYLE_ID)) return;

    const txt = `
      li.${CONFIG.SEL_CLASS} .poster,
      div.${CONFIG.SEL_CLASS} .poster {
        opacity: 1 !important;
        outline: 2px solid #00e054 !important;
        outline-offset: -1px !important;
        box-shadow: 0 0 30px rgba(0, 224, 84, 0.4) !important;
        z-index: 9998;
        transform: scale(1.05);
      }
      body.${CONFIG.ACT_CLASS} .poster-list li:not(.${CONFIG.SEL_CLASS}) .poster,
      body.${CONFIG.ACT_CLASS} .griditem:not(.${CONFIG.SEL_CLASS}) .poster,
      body.${CONFIG.ACT_CLASS} li.film-detail:not(.${CONFIG.SEL_CLASS}) .poster {
        opacity: 0.3 !important;
        transition: opacity 0.2s linear;
      }
      #${CONFIG.OVERLAY_ID} {
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
      #${CONFIG.OVERLAY_ID}::before {
          content: ""; position: absolute;
          top: -100%; left: -100%; width: 300%; height: 300%;
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
      #${CONFIG.OVERLAY_ID} .c-post {
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
      #${CONFIG.OVERLAY_ID} .c-info {
          opacity: 0; animation: s 0.5s ease-out forwards; animation-delay: 0.2s;
          color: #fff; max-width: 800px; padding: 0 20px; z-index: 1;
      }
      @keyframes s { from { transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }
      #${CONFIG.OVERLAY_ID} h1 {
          font-family: 'Tiempos Headline', Georgia, serif; font-size: 2.8em; font-weight: 700;
          margin: 0 0 8px 0; line-height: 1.1; color: #ffffff; letter-spacing: -0.01em;
      }
      #${CONFIG.OVERLAY_ID} .meta {
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 1.15em;
          color: #ccddee; font-weight: 400; margin-bottom: 6px; text-transform: uppercase;
          letter-spacing: 0.05em; display: flex; align-items: center; justify-content: center;
          gap: 10px; flex-wrap: wrap;
      }
      #${CONFIG.OVERLAY_ID} .meta span.sep { color: #445566; font-size: 0.8em; }
      #${CONFIG.OVERLAY_ID} .rate { color: #00e054; font-weight: 500; display: inline-flex; align-items: center; }
      #${CONFIG.OVERLAY_ID} .star { color: #00e054; font-size: 1.35em; margin-right: 4px; line-height: 1; position: relative; top: -1px; }
      #${CONFIG.OVERLAY_ID} .gen {
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 0.95em;
          color: #778899; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 30px;
      }
      #${CONFIG.OVERLAY_ID} .act-btn {
          padding: 16px 50px; background: #00e054; color: #ffffff !important;
          font-family: 'Graphik', Helvetica, Arial, sans-serif; font-size: 14px;
          font-weight: 700; border-radius: 3px; text-decoration: none; text-transform: uppercase;
          letter-spacing: 0.12em; transition: all 0.2s ease; display: inline-block;
          cursor: pointer; border: none; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.25);
      }
      #${CONFIG.OVERLAY_ID} .act-btn:hover {
          background: #00d04f; color: #ffffff !important; box-shadow: 0 6px 25px rgba(0, 0, 0, 0.35);
      }
      .hint {
          margin-top: 25px; font-size: 0.75em; color: rgba(255, 255, 255, 0.3); font-weight: 500;
          letter-spacing: 0.1em; cursor: pointer; transition: color 0.3s; text-transform: uppercase;
      }
      .hint:hover { color: rgba(255, 255, 255, 0.8); }
    `;

    const style = document.createElement("style");
    style.id = CONFIG.STYLE_ID;
    style.textContent = txt;
    (document.head || document.documentElement).appendChild(style);
  }

  function getFilmLink(el) {
      const anchor = el.querySelector('a[href^="/film/"]');
      if (anchor) return anchor.href;
      const itemDiv = el.querySelector('div[data-item-link]');
      if (itemDiv) return "https://letterboxd.com" + itemDiv.getAttribute('data-item-link');
      return null;
  }

  async function fetchUrl(url, retryCount = 0) {
      try {
          const response = await fetch(url);
          if (!response.ok) throw new Error('HTTP Error');
          const text = await response.text();
          return new DOMParser().parseFromString(text, 'text/html');
      } catch (e) {
          if (retryCount < CONFIG.MAX_RETRY) {
              const delay = 500 * Math.pow(2, retryCount);
              await new Promise(r => setTimeout(r, delay));
              return fetchUrl(url, retryCount + 1);
          }
          throw e;
      }
  }

  const metadataCache = new Map();

  async function getMetaData(url) {
      if (metadataCache.has(url)) return metadataCache.get(url);

      let metadata = { dir: "", rate: "", year: "", date: null, time: "", gen: "" };
      try {
          const doc = await fetchUrl(url);
          const jsonLdScript = doc.querySelector('script[type="application/ld+json"]');
          let jsonData = null;
          if (jsonLdScript) { try { jsonData = JSON.parse(jsonLdScript?.textContent); } catch(e){} }

          if (jsonData && jsonData.genre) {
              const genres = Array.isArray(jsonData.genre) ? jsonData.genre : [jsonData.genre];
              metadata.gen = genres.slice(0, 3).join(" / ");
          }
          if (!metadata.gen) {
              const links = doc.querySelectorAll('.text-sluglist.capitalize a.text-slug[href*="/films/genre/"]');
              if (links && links.length > 0) metadata.gen = Array.from(links).slice(0, 3).map(a => a.innerText).join(" / ");
          }

          if (jsonData && jsonData.datePublished) {
              metadata.year = jsonData.datePublished.substring(0, 4);
              metadata.date = jsonData.datePublished;
          } else {
              const yearEl = doc.querySelector('.film-header .releaseyear a');
              if (yearEl) metadata.year = yearEl?.innerText;
          }

          if (jsonData && jsonData.director) {
              const directors = Array.isArray(jsonData.director) ? jsonData.director : [jsonData.director];
              metadata.dir = directors.map(o => o.name).join(", ");
          } else {
              const metaDir = doc.querySelector('meta[name="twitter:data1"]');
              if (metaDir) metadata.dir = metaDir?.content;
          }

          if (jsonData && jsonData.aggregateRating && jsonData.aggregateRating.ratingValue) {
              metadata.rate = parseFloat(jsonData.aggregateRating.ratingValue).toFixed(1);
          } else {
              const metaRate = doc.querySelector('meta[name="twitter:data2"]');
              if (metaRate && metaRate.content) {
                  const match = metaRate.content.match(/^([\d.]+)/);
                  if (match) metadata.rate = parseFloat(match[1]).toFixed(1);
              }
          }

          if (jsonData && jsonData.duration) metadata.time = parseDuration(jsonData.duration);
          if (!metadata.time) {
              const footer = doc.querySelector('.text-footer');
              if (footer) {
                  const match = footer.innerText.match(/(\d+)\s+mins/);
                  if (match) {
                      const m = parseInt(match[1]);
                      const h = Math.floor(m / 60);
                      const mm = m % 60;
                      metadata.time = (h > 0) ? `${h}h ${mm}m` : `${mm}m`;
                  }
              }
          }
      } catch (e) {
          console.warn("Metadata fetch failed for", url, e);
      }

      metadataCache.set(url, metadata);
      return metadata;
  }

  async function showDialog(el) {
      const link = getFilmLink(el);
      const metadata = link ? await getMetaData(link) : {dir:"", rate:"", year:"", date: null, time:"", gen:""};
      renderOverlay(el, metadata);
  }

  function closeOverlay() {
      const overlay = document.getElementById(CONFIG.OVERLAY_ID);
      if (overlay) overlay.remove();
      unmark();
      setMode(false);
      window.ROULETTE.spin = false;
      if (window.ROULETTE.timer) clearTimeout(window.ROULETTE.timer);
      window.ROULETTE.img = null;
      window.ROULETTE.src = null;
  }

  function renderError(text) {
      const overlay = document.createElement('div');
      overlay.id = CONFIG.OVERLAY_ID;
      document.body.appendChild(overlay);

      const closebutton = document.createElement('div');
      closebutton.className = "r-close";
      closebutton.textContent = "×";
      overlay.appendChild(closebutton);

      const infoContainer = document.createElement('div');
      infoContainer.className = "c-info";
      infoContainer.style.maxWidth = "600px";
      overlay.appendChild(infoContainer);

      const gremlinImg = document.createElement('img');
      gremlinImg.src = "https://raw.githubusercontent.com/kewwwal/rouletteboxd/main/assets/gremlin.png";
      gremlinImg.style.cssText = "height: 240px; width: auto; display: block; margin: 0 auto 30px auto; filter: drop-shadow(0 10px 15px rgba(0,0,0,0.5));";
      gremlinImg.alt = "Gremlin";
      infoContainer.appendChild(gremlinImg);

      const heading = document.createElement('h1');
      heading.style.color = "#ffffff";
      heading.textContent = "No Films Found";
      infoContainer.appendChild(heading);

      const para = document.createElement('p');
      para.style.cssText = "font-size:1.2em; color:#9ab; margin-bottom:30px; line-height: 1.5; font-family: 'Graphik', Helvetica, Arial, sans-serif;";
      para.textContent = text;
      infoContainer.appendChild(para);

      const actionBtn = document.createElement('div');
      actionBtn.className = "act-btn";
      actionBtn.textContent = "CLOSE";
      infoContainer.appendChild(actionBtn);

      closebutton.onclick = closeOverlay;
      actionBtn.onclick = closeOverlay;
  }

  function createCloseBtn(parent) {
      const btn = document.createElement('div');
      btn.className = "r-close";
      btn.textContent = "×";
      btn.setAttribute("role", "button");
      btn.setAttribute("tabindex", "0");
      btn.setAttribute("aria-label", "Close");
      btn.onclick = closeOverlay;
      btn.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeOverlay(); }};
      parent.appendChild(btn);
  }

  function createPosterDisplay(parentElement, imageSource) {
      const posterContainer = document.createElement('div');
      posterContainer.className = "p-box";
      const posterImage = document.createElement('img');
      posterImage.src = imageSource;
      posterImage.className = "c-post";
      posterImage.alt = "Winner";
      posterContainer.appendChild(posterImage);
      parentElement.appendChild(posterContainer);
      posterImage.onerror = function() {
          this.src = window.ROULETTE.src;
          this.style.transform = "none";
          this.onerror = null;
      };
      return { container: posterContainer, posterimg: posterImage };
  }

  function createInfoPanel(parent, title, meta, link) {
      const div = document.createElement('div');
      div.className = "c-info";
      parent.appendChild(div);

      const h1 = document.createElement('h1');
      h1.textContent = title;
      div.appendChild(h1);

      const metaDiv = document.createElement('div');
      metaDiv.className = "meta";
      div.appendChild(metaDiv);

      const span = (text, cls) => {
          const s = document.createElement('span');
          if (cls) s.className = cls;
          s.textContent = text;
          return s;
      };

      const items = [];
      if (meta.dispYear) items.push(span(meta.dispYear));
      if (meta.time) items.push(span(meta.time));
      if (meta.dir) items.push(span(`DIRECTED BY ${meta.dir.toUpperCase()}`));

      const rateBox = document.createElement('span');
      rateBox.className = "rate";
      rateBox.setAttribute("aria-label", `Rating: ${meta.rate}`);
      const star = document.createElement('span');
      star.className = "star";
      star.textContent = "★";
      rateBox.appendChild(star);
      rateBox.appendChild(document.createTextNode(meta.rate || "NO RATING"));
      items.push(rateBox);

      items.forEach((item, idx) => {
          metaDiv.appendChild(item);
          if (idx < items.length - 1) metaDiv.appendChild(span("•", "sep"));
      });

      if (meta.gen) {
          const genreDiv = document.createElement('div');
          genreDiv.className = "gen";
          genreDiv.textContent = meta.gen.toUpperCase();
          div.appendChild(genreDiv);
      }

      const activeBtn = document.createElement('a');
      activeBtn.href = link || "#";
      activeBtn.className = "act-btn";
      activeBtn.textContent = "DIVE IN";
      activeBtn.setAttribute("role", "button");
      div.appendChild(activeBtn);
      setTimeout(() => activeBtn.focus(), 100);

      const hint = document.createElement('div');
      hint.className = "hint";
      hint.textContent = "Press R to Reroll";
      hint.setAttribute("role", "button");
      hint.setAttribute("tabindex", "0");
      hint.onclick = () => { closeOverlay(); startRoulette(); };
      hint.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); closeOverlay(); startRoulette(); }};
      div.appendChild(hint);
  }

  function applyTiltEffect(container, image) {
      if (!container || !image) return;
      container.addEventListener('mousemove', (e) => {
          const rect = container.getBoundingClientRect();
          const mouseX = e.clientX - rect.left;
          const mouseY = e.clientY - rect.top;
          const rx = ((mouseY - rect.height / 2) / (rect.height / 2)) * -8;
          const ry = ((mouseX - rect.width / 2) / (rect.width / 2)) * 8;
          image.style.transform = `scale(1.08) rotateX(${rx}deg) rotateY(${ry}deg)`;
          image.style.boxShadow = `0 35px 70px rgba(0,0,0,0.9)`;
      });
      container.addEventListener('mouseleave', () => {
          image.style.transform = 'scale(1) rotateX(0) rotateY(0)';
          image.style.boxShadow = `0 10px 40px rgba(0,0,0,0.6)`;
      });
  }

  function renderOverlay(el, meta) {
      unmark();
      const posterData = getPosterData(el);
      const s1 = posterData.src || CONFIG.FALLBACK_IMG;
      window.ROULETTE.src = s1;

      let finalSrc = s1;
      if (window.ROULETTE.img && window.ROULETTE.img.complete && window.ROULETTE.img.naturalWidth > 0) {
          finalSrc = window.ROULETTE.img.src;
      } else {
          const highRes = getHighResUrl(s1);
          if (highRes) finalSrc = highRes;
      }

      let title = "Unknown";
      if (posterData.el && posterData.el.alt) title = posterData.el.alt;
      title = title.replace(/^Poster for\s+/i, '');

      let dispYear = meta.year;
      const yearMatch = title.match(/\((\d{4})\)$/);
      if (yearMatch) {
          dispYear = yearMatch[1];
          title = title.replace(/\s\(\d{4}\)$/, '');
      }

      const updatedMeta = { ...meta, dispYear };
      const link = getFilmLink(el);

      const overlay = document.createElement('div');
      overlay.id = CONFIG.OVERLAY_ID;
      document.body.appendChild(overlay);

      createCloseBtn(overlay);
      const { container, posterimg } = createPosterDisplay(overlay, finalSrc);
      createInfoPanel(overlay, title, updatedMeta, link);
      applyTiltEffect(container, posterimg);
  }

  function getCandidates(strict = false) {
    const posters = Array.from(document.querySelectorAll('div.film-poster'));

    if (posters.length === 0) return [];

    const readyItems = posters.filter(poster => poster.hasAttribute('data-watched'));

    if (strict && readyItems.length === 0 && posters.length > 0) {
        return [];
    }

    const items = posters.map(poster => {
        return {
            posterDiv: poster,
            listItem: poster.closest('li')
        };
    }).filter(pair => pair.listItem);

    const unwatchedItems = items.filter(pair => {
        const posterDiv = pair.posterDiv;

        if (!posterDiv.hasAttribute('data-watched')) {
             return false;
        }

        let isWatched = false;

        if (posterDiv.getAttribute('data-watched') === 'true') {
            isWatched = true;
        }

        if (isWatched) {
             return false;
        }

        return true;
    });

    return unwatchedItems.map(pair => pair.listItem);
  }

  function triggerRoulette() {
      if(document.getElementById(CONFIG.OVERLAY_ID)) closeOverlay();
      startRoulette();
  }

  function startRoulette() {
    if (window.ROULETTE.spin) return;
    injectStyles();
    setMode(true);
    window.ROULETTE.active = true;

    const candidates = getCandidates();

    if (candidates.length === 0) {
        setMode(false);
        renderError("We couldn't find any films on this page.");
        return;
    }

    window.ROULETTE.spin = true;

    const winIdx = Math.floor(Math.random() * candidates.length);
    const winEl = candidates[winIdx];

    const posterData = getPosterData(winEl);
    const highRes = getHighResUrl(posterData.src);
    if (highRes) {
        window.ROULETTE.img = new Image();
        window.ROULETTE.img.src = highRes;
    }

    let step = 0;
    const steps = Math.floor(Math.random() * 10) + 20;
    let delay = 35;

    function nextStep() {
        if (!window.ROULETTE.spin) return;
        unmark();
        let targetIdx;
        if (step >= steps) targetIdx = winIdx;
        else targetIdx = Math.floor(Math.random() * candidates.length);

        const el = candidates[targetIdx];
        if (el) {
            mark(el);
            const behavior = (step >= steps - 5) ? "smooth" : "auto";
            const block = (step >= steps - 5) ? "center" : "nearest";
            el.scrollIntoView({ behavior: behavior, block: block, inline: "center" });
        }

        if (step < steps) {
            step++;
            delay = Math.floor(delay * 1.12);
            window.ROULETTE.timer = setTimeout(nextStep, delay);
        } else {
            window.ROULETTE.spin = false;
            showDialog(winEl);
        }
    }
    nextStep();
  }

  function init() {
      let tId = null;
      const obs = new MutationObserver((mutations, observer) => {
          if (getCandidates(true).length > 0) {
              observer.disconnect();
              if (tId) clearTimeout(tId);
              window.ROULETTE.ready = true;
          }
      });
      obs.observe(document.body, { childList: true, subtree: true });
      if (getCandidates(true).length > 0) {
          obs.disconnect();
          window.ROULETTE.ready = true;
      } else {
          tId = setTimeout(() => {
              obs.disconnect();
              window.ROULETTE.ready = true;
          }, CONFIG.TIMEOUT_FALLBACK);
      }
  }

  init();

  window.addEventListener("keydown", (e) => {
    if (e.code === "KeyR" && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey) {
      if (isInput(document.activeElement)) return;
      if (!window.ROULETTE.ready) {
           return;
      }
      triggerRoulette();
    }
    if (e.code === "Escape") closeOverlay();
  });
})();
