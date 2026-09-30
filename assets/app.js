(() => {
  "use strict";

  const PALETTE = ["#FFD23F", "#FF5DA2", "#2FD08A", "#8FA0FF", "#FF9F45", "#C7B6FF"];
  const $ = (id) => document.getElementById(id);

  const state = {
    site: {},
    works: [],
    categories: [],
    filter: "Все",
    open: null,   // индекс работы в state.works
    photo: 0,     // индекс фото внутри работы
    lastFocus: null
  };

  // Pages CMS пишет пути вида "/images/foo.jpg". Делаем их относительными,
  // чтобы сайт работал и на username.github.io/repo, и на своём домене.
  const src = (p) => (p || "").replace(/^\/+/, "");

  const slug = (s) =>
    String(s || "").toLowerCase().trim()
      .replace(/[«»"'.,!?()]/g, "")
      .replace(/\s+/g, "-");

  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  const paragraphs = (text) =>
    String(text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
      .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");

  const colorOf = (cat) => {
    const i = state.categories.indexOf(cat);
    return PALETTE[(i < 0 ? state.categories.length : i) % PALETTE.length];
  };

  const formatDate = (d) => {
    if (!d) return "";
    const date = new Date(d);
    if (isNaN(date)) return d;
    return date.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  };

  const photosOf = (w) => [w.cover, ...(Array.isArray(w.gallery) ? w.gallery : [])].filter(Boolean);

  // ---------- Загрузка данных ----------
  async function load() {
    try {
      const [site, works] = await Promise.all([
        fetch("content/site.json", { cache: "no-cache" }).then((r) => r.json()),
        fetch("content/works.json", { cache: "no-cache" }).then((r) => r.json())
      ]);
      state.site = site || {};
      const list = Array.isArray(works) ? works : (works && works.works) || [];
      state.works = list.filter((w) => w && w.title && w.cover).map((w, i) => {
        let id = slug(w.title) || String(i + 1);
        return { ...w, id };
      });
      // одинаковые названия → добавим номер
      const seen = {};
      state.works.forEach((w) => { seen[w.id] = (seen[w.id] || 0) + 1; if (seen[w.id] > 1) w.id += "-" + seen[w.id]; });

      const declared = Array.isArray(site.categories) ? site.categories.filter(Boolean) : [];
      const extra = [...new Set(state.works.map((w) => w.category).filter((c) => c && !declared.includes(c)))];
      state.categories = [...declared, ...extra];
      renderAll();
      route();
    } catch (err) {
      console.error(err);
      $("masthead").textContent = "Портфолио";
      $("empty").hidden = false;
      $("empty").textContent = location.protocol === "file:"
        ? "Сайт нужно открыть через веб-сервер или GitHub Pages: браузер не читает данные с диска напрямую."
        : "Не удалось загрузить работы. Проверьте файлы content/works.json и content/site.json.";
    }
  }

  // Длинное имя уменьшается, чтобы слова не переносились по буквам
  function fitMasthead() {
    const h = $("masthead");
    h.style.fontSize = "";
    const room = h.parentElement.clientWidth;
    const widest = Math.max(...[...h.children].map((s) => s.offsetLeft - h.offsetLeft + s.scrollWidth));
    if (widest > room) {
      const size = parseFloat(getComputedStyle(h).fontSize);
      h.style.fontSize = Math.floor(size * room / widest) + "px";
    }
  }
  window.addEventListener("resize", () => { clearTimeout(fitMasthead.t); fitMasthead.t = setTimeout(fitMasthead, 120); });

  // ---------- Отрисовка ----------
  function renderAll() {
    const s = state.site;
    const name = s.name || "Портфолио";
    document.title = name + " — портфолио";
    const words = name.trim().split(/\s+/);
    const h = $("masthead");
    h.classList.toggle("masthead--single", words.length === 1);
    if (words.length === 1 && [...words[0]].length >= 3) {
      // Один ник: делим на две цветные части по середине
      const chars = [...words[0]];
      const cut = Math.ceil(chars.length / 2);
      h.innerHTML = `<span><span class="m-a">${esc(chars.slice(0, cut).join(""))}</span><span class="m-b">${esc(chars.slice(cut).join(""))}</span></span>`;
    } else {
      h.innerHTML = words.map((w) => `<span>${esc(w)}</span>`).join("");
    }
    $("tagline").textContent = s.tagline || "";
    fitMasthead();
    if (document.fonts) document.fonts.ready.then(fitMasthead);
    $("footerName").textContent = `© ${new Date().getFullYear()} ${name}`;

    // обложка
    const hero = state.works.find((w) => w.featured) || state.works[0];
    if (hero) {
      const btn = $("coverStory");
      btn.hidden = false;
      $("coverImg").src = src(hero.cover);
      $("coverImg").alt = hero.title;
      $("coverTitle").textContent = hero.title;
      $("coverCat").textContent = hero.category || "";
      $("coverCat").style.setProperty("--c", colorOf(hero.category));
      btn.setAttribute("aria-label", "Открыть работу «" + hero.title + "»");
      btn.onclick = () => openWork(state.works.indexOf(hero));
    }

    // обо мне
    $("aboutText").innerHTML = paragraphs(s.about);
    if (s.avatar) { $("avatar").src = src(s.avatar); $("avatar").alt = name; $("avatar").hidden = false; }
    $("contacts").innerHTML = (s.contacts || []).filter((c) => c && c.url)
      .map((c) => `<li><a href="${esc(c.url)}" target="_blank" rel="noopener">${esc(c.label || c.url)}</a></li>`).join("");

    renderFilters();
    renderGrid();
  }

  function renderFilters() {
    const counts = {};
    state.works.forEach((w) => { counts[w.category] = (counts[w.category] || 0) + 1; });
    const items = [["Все", state.works.length, "#EEE8FF"], ...state.categories.map((c) => [c, counts[c] || 0, colorOf(c)])];
    $("filters").innerHTML = items.map(([c, n, col]) =>
      `<button class="filter" role="tab" type="button" data-cat="${esc(c)}" style="--c:${col}" aria-selected="${c === state.filter}">
        ${esc(c)} <span class="filter__count">${n}</span></button>`).join("");
  }

  function visible() {
    return state.filter === "Все" ? state.works : state.works.filter((w) => w.category === state.filter);
  }

  function renderGrid() {
    const list = visible();
    $("grid").innerHTML = list.map((w) => {
      const n = photosOf(w).length;
      const photos = photosOf(w);
      const under = photos.slice(1, 3).map((p, k) =>
        `<span class="card__under card__under--${k + 1}" style="background-image:url('${esc(src(p))}')" aria-hidden="true"></span>`).join("");
      return `<button class="card${n > 1 ? " card--stack" : ""}" type="button" data-id="${esc(w.id)}" style="--c:${colorOf(w.category)}">
        <span class="card__frame">
          ${under}
          <img class="card__img" src="${esc(src(w.cover))}" alt="${esc(w.title)}${n > 1 ? `, ${n} фото` : ""}" loading="lazy" decoding="async">
          ${n > 1 ? `<span class="card__count tape" aria-hidden="true">${n} фото</span>` : ""}
        </span>
        <span class="card__meta">
          <span class="card__title">${esc(w.title)}</span>
          <span class="card__cat">${esc(w.category || "")}</span>
        </span>
      </button>`;
    }).join("");
    const empty = $("empty");
    empty.hidden = list.length > 0;
    empty.textContent = state.works.length
      ? "В этой категории пока нет работ."
      : "Работ пока нет. Добавьте первую в админке Pages CMS — она появится здесь через минуту.";
  }

  function setFilter(cat, push = true) {
    state.filter = state.categories.includes(cat) ? cat : "Все";
    document.querySelectorAll(".filter").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.cat === state.filter)));
    renderGrid();
    if (push) history.replaceState(null, "", state.filter === "Все" ? location.pathname : "#cat=" + encodeURIComponent(state.filter));
  }

  // ---------- Просмотр работы ----------
  function openWork(i, photo = 0, push = true) {
    const w = state.works[i];
    if (!w) return;
    if (state.open === null) state.lastFocus = document.activeElement;
    state.open = i;
    state.photo = photo;
    const v = $("viewer");
    v.hidden = false;
    document.body.classList.add("is-locked");
    const cat = $("vCat");
    cat.textContent = w.category || "";
    cat.style.setProperty("--c", colorOf(w.category));
    $("vTitle").textContent = w.title;
    $("vMeta").textContent = [w.materials, formatDate(w.date)].filter(Boolean).join(", ");
    $("vDesc").innerHTML = paragraphs(w.description);
    showPhoto();

    const list = visible();
    const pos = list.indexOf(w);
    $("vPrevWork").disabled = pos <= 0;
    $("vNextWork").disabled = pos < 0 || pos >= list.length - 1;
    if (push) history.pushState({ work: w.id }, "", "#work=" + encodeURIComponent(w.id));
    $("vClose").focus();
  }

  function showPhoto() {
    const w = state.works[state.open];
    const photos = photosOf(w);
    state.photo = (state.photo + photos.length) % photos.length;
    const img = $("vImg");
    img.src = src(photos[state.photo]);
    img.alt = w.title + (photos.length > 1 ? `, фото ${state.photo + 1} из ${photos.length}` : "");
    img.style.animation = "none"; void img.offsetWidth; img.style.animation = "";
    const multi = photos.length > 1;
    $("vPrev").hidden = $("vNext").hidden = !multi;
    $("vThumbs").innerHTML = multi ? photos.map((p, k) =>
      `<button type="button" data-k="${k}" aria-label="Фото ${k + 1}" aria-current="${k === state.photo}">
        <img src="${esc(src(p))}" alt="" loading="lazy"></button>`).join("") : "";
  }

  function closeWork(push = true) {
    if (state.open === null) return;
    state.open = null;
    $("viewer").hidden = true;
    document.body.classList.remove("is-locked");
    if (push) history.pushState(null, "", state.filter === "Все" ? location.pathname : "#cat=" + encodeURIComponent(state.filter));
    if (state.lastFocus) state.lastFocus.focus();
  }

  function stepWork(dir) {
    const list = visible();
    const pos = list.indexOf(state.works[state.open]);
    const next = list[pos + dir];
    if (next) openWork(state.works.indexOf(next), 0, false), history.replaceState(null, "", "#work=" + encodeURIComponent(next.id));
  }

  async function share() {
    const w = state.works[state.open];
    const url = location.href.split("#")[0] + "#work=" + encodeURIComponent(w.id);
    if (navigator.share) {
      try { await navigator.share({ title: w.title, url }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Ссылка на работу скопирована"); }
    catch { prompt("Скопируйте ссылку:", url); }
  }

  let toastTimer;
  function toast(text) {
    const t = $("toast");
    t.textContent = text;
    t.classList.add("is-on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-on"), 2200);
  }

  // ---------- Адресная строка ----------
  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h.startsWith("work=")) {
      const i = state.works.findIndex((w) => w.id === h.slice(5));
      if (i >= 0) return openWork(i, 0, false);
    }
    closeWork(false);
    if (h.startsWith("cat=")) setFilter(h.slice(4), false);
  }

  // ---------- События ----------
  $("filters").addEventListener("click", (e) => {
    const b = e.target.closest(".filter");
    if (b) setFilter(b.dataset.cat);
  });
  $("grid").addEventListener("click", (e) => {
    const c = e.target.closest(".card");
    if (c) openWork(state.works.findIndex((w) => w.id === c.dataset.id));
  });
  $("vClose").addEventListener("click", () => closeWork());
  $("vPrev").addEventListener("click", () => { state.photo--; showPhoto(); });
  $("vNext").addEventListener("click", () => { state.photo++; showPhoto(); });
  $("vThumbs").addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (b) { state.photo = +b.dataset.k; showPhoto(); }
  });
  $("vShare").addEventListener("click", share);
  $("vPrevWork").addEventListener("click", () => stepWork(-1));
  $("vNextWork").addEventListener("click", () => stepWork(1));

  document.addEventListener("keydown", (e) => {
    if (state.open === null) return;
    if (e.key === "Escape") closeWork();
    else if (e.key === "ArrowLeft") { state.photo--; showPhoto(); }
    else if (e.key === "ArrowRight") { state.photo++; showPhoto(); }
    else if (e.key === "Tab") {
      const f = [...$("viewer").querySelectorAll("button:not([hidden]):not(:disabled)")].filter((b) => b.offsetParent);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  // свайп по фото на телефоне
  let x0 = null;
  $("vImg").addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  $("vImg").addEventListener("touchend", (e) => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) { state.photo += dx < 0 ? 1 : -1; showPhoto(); }
    x0 = null;
  });

  window.addEventListener("popstate", route);
  load();
})();
