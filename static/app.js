const API = "/api";
let recipes = [];
let searchTimer;
let activeFilters = { tipo: "", status: "", source: "" };
let currentRecipe = null;

const TIPO_CYCLE   = ["salgado", "doce", "bebida"];
const STATUS_CYCLE = ["quero_fazer", "ja_fiz"];
const TIPO_LABEL   = { salgado: "Salgado", doce: "Doce", bebida: "Bebida" };
const STATUS_LABEL = { quero_fazer: "Quero fazer", ja_fiz: "Já fiz" };

// ─── DOM ─────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const listView     = $("list-view");
const detailView   = $("detail-view");
const recipeList   = $("recipe-list");
const urlInput     = $("url-input");
const addBtn       = $("add-btn");
const statusEl     = $("status");
const searchEl     = $("search");
const backBtn      = $("back-btn");
const wordmark     = $("wordmark");
const modeUrl      = $("mode-url");
const modeText     = $("mode-text");
const textInput    = $("text-input");
const sourceInput  = $("source-input");
const addTextBtn   = $("add-text-btn");
const statusTextEl = $("status-text");
const photoWrap    = $("photo-wrap");
const photoFileInput = $("photo-file-input");
const editBtn      = $("edit-btn");
const saveBtn      = $("save-btn");
const cancelBtn    = $("cancel-btn");
const dPhoto       = $("d-photo");
const photoPlaceholder = $("photo-placeholder");
const photoUrlRow  = $("photo-url-row");
const photoUrlInput = $("photo-url-input");
const modePhoto    = $("mode-photo");
const recipePhotoInput = $("recipe-photo-input");
const statusPhotoEl = $("status-photo");
const filterSource = $("filter-source");

// ─── Boot ────────────────────────────────────────────────
async function init() {
  [recipes] = await Promise.all([fetchRecipes(), loadSources()]);
  renderList(recipes);
  const slug = new URLSearchParams(location.search).get("r");
  if (slug) {
    const r = recipes.find(x => x.slug === slug);
    if (r) showDetail(r);
  }
}

async function loadSources() {
  const sources = await fetch(`${API}/sources`).then(r => r.json()).catch(() => []);
  filterSource.innerHTML = '<option value="">Todas as fontes</option>';
  sources.forEach(s => {
    const opt = document.createElement("option");
    opt.value = s; opt.textContent = s;
    filterSource.appendChild(opt);
  });
}

// ─── API helpers ─────────────────────────────────────────
async function fetchRecipes() {
  const p = new URLSearchParams();
  if (searchEl.value.trim())    p.set("q",      searchEl.value.trim());
  if (activeFilters.tipo)       p.set("tipo",    activeFilters.tipo);
  if (activeFilters.status)     p.set("status",  activeFilters.status);
  if (activeFilters.source)     p.set("source",  activeFilters.source);
  return fetch(`${API}/recipes?${p}`).then(r => r.json());
}

async function postJSON(url, body) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Erro."); }
  return res.json();
}

async function patchJSON(url, body) {
  const res = await fetch(url, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Erro."); }
  return res.json();
}

// ─── Add from URL ────────────────────────────────────────
addBtn.addEventListener("click", async () => {
  const url = urlInput.value.trim();
  if (!url) return;
  addBtn.disabled = true;
  setStatus(statusEl, "Buscando e processando…");
  try {
    const recipe = await postJSON(`${API}/recipes`, { url });
    urlInput.value = "";
    setStatus(statusEl, "");
    recipes.unshift(recipe);
    renderList(recipes);
    await loadSources();
    showDetail(recipe);
  } catch (e) {
    setStatus(statusEl, e.message, true);
  } finally {
    addBtn.disabled = false;
  }
});

urlInput.addEventListener("keydown", e => { if (e.key === "Enter") addBtn.click(); });

// ─── Add from text ───────────────────────────────────────
addTextBtn.addEventListener("click", async () => {
  const text = textInput.value.trim();
  if (!text) return;
  addTextBtn.disabled = true;
  setStatus(statusTextEl, "Processando…");
  try {
    const recipe = await postJSON(`${API}/recipes/from-text`, { text, source_url: sourceInput.value.trim() });
    textInput.value = ""; sourceInput.value = "";
    setStatus(statusTextEl, "");
    modeText.style.display = "none"; modeUrl.style.display = "block";
    recipes.unshift(recipe); renderList(recipes);
    await loadSources();
    showDetail(recipe);
  } catch (e) {
    setStatus(statusTextEl, e.message, true);
  } finally {
    addTextBtn.disabled = false;
  }
});

$("toggle-text").addEventListener("click",         () => { modeUrl.style.display = "none"; modePhoto.style.display = "none"; modeText.style.display = "block"; textInput.focus(); });
$("toggle-photo").addEventListener("click",        () => { modeUrl.style.display = "none"; modeText.style.display = "none"; modePhoto.style.display = "block"; });
$("toggle-url").addEventListener("click",          () => { modeText.style.display = "none"; modePhoto.style.display = "none"; modeUrl.style.display = "block"; urlInput.focus(); });
$("toggle-url-from-photo").addEventListener("click", () => { modePhoto.style.display = "none"; modeUrl.style.display = "block"; urlInput.focus(); });

filterSource.addEventListener("change", async () => {
  activeFilters.source = filterSource.value;
  recipes = await fetchRecipes(); renderList(recipes);
});

recipePhotoInput.addEventListener("change", async () => {
  const file = recipePhotoInput.files[0];
  if (!file) return;
  setStatus(statusPhotoEl, "Processando imagem…");
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(`${API}/recipes/from-image`, { method: "POST", body: form });
    if (!res.ok) { const e = await res.json(); throw new Error(e.detail || "Erro."); }
    const recipe = await res.json();
    recipePhotoInput.value = "";
    setStatus(statusPhotoEl, "");
    modePhoto.style.display = "none"; modeUrl.style.display = "block";
    recipes.unshift(recipe); renderList(recipes);
    await loadSources();
    showDetail(recipe);
  } catch (e) {
    setStatus(statusPhotoEl, e.message, true);
    recipePhotoInput.value = "";
  }
});

// ─── Filters ─────────────────────────────────────────────
$("filter-tipo").addEventListener("click", async e => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  activeFilters.tipo = btn.dataset.value;
  setActiveSeg("filter-tipo", btn.dataset.value);
  recipes = await fetchRecipes(); renderList(recipes);
});

$("filter-status").addEventListener("click", async e => {
  const btn = e.target.closest(".seg-btn");
  if (!btn) return;
  activeFilters.status = btn.dataset.value;
  setActiveSeg("filter-status", btn.dataset.value);
  recipes = await fetchRecipes(); renderList(recipes);
});

function setActiveSeg(groupId, value) {
  document.querySelectorAll(`#${groupId} .seg-btn`).forEach(b =>
    b.classList.toggle("active", b.dataset.value === value)
  );
}

// ─── Search ──────────────────────────────────────────────
searchEl.addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(async () => { recipes = await fetchRecipes(); renderList(recipes); }, 280);
});

// ─── Render list ─────────────────────────────────────────
function renderList(items) {
  if (!items.length) {
    recipeList.innerHTML = '<p class="empty">Nenhuma receita</p>';
    return;
  }

  recipeList.innerHTML = items.map(r => {
    const thumb = r.image_url
      ? `<img class="row-thumb" src="${esc(r.image_url)}" alt="" loading="lazy">`
      : `<div class="row-thumb-placeholder"></div>`;
    return `
      <div class="recipe-row" data-slug="${r.slug}">
        ${thumb}
        <div class="row-text">
          <div class="row-title">${esc(r.title)}</div>
          <div class="row-cats">
            <button class="row-cat tipo" data-slug="${r.slug}" data-field="tipo" data-value="${r.tipo}">${TIPO_LABEL[r.tipo] || r.tipo}</button>
            <button class="row-cat status ${r.status === 'ja_fiz' ? 'ja-fiz' : ''}" data-slug="${r.slug}" data-field="status" data-value="${r.status}">${STATUS_LABEL[r.status] || r.status}</button>
          </div>
        </div>
      </div>`;
  }).join("");

  recipeList.querySelectorAll(".row-thumb").forEach(img => {
    img.addEventListener("error", () => { const ph = document.createElement("div"); ph.className = "row-thumb-placeholder"; img.replaceWith(ph); });
  });

  recipeList.querySelectorAll(".recipe-row").forEach(row => {
    row.addEventListener("click", e => {
      if (e.target.closest(".row-cat")) return;
      const r = recipes.find(x => x.slug === row.dataset.slug);
      if (r) showDetail(r);
    });
  });

  recipeList.querySelectorAll(".row-cat").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      const { slug, field, value } = btn.dataset;
      const cycle = field === "tipo" ? TIPO_CYCLE : STATUS_CYCLE;
      const next  = cycle[(cycle.indexOf(value) + 1) % cycle.length];
      try {
        const updated = await patchJSON(`${API}/recipes/${slug}`, { [field]: next });
        const idx = recipes.findIndex(r => r.slug === slug);
        if (idx !== -1) recipes[idx] = updated;
        btn.dataset.value = next;
        btn.textContent   = field === "tipo" ? TIPO_LABEL[next] : STATUS_LABEL[next];
        if (field === "status") btn.classList.toggle("ja-fiz", next === "ja_fiz");
        if (currentRecipe?.slug === slug) {
          currentRecipe = updated;
          setActiveSeg("detail-tipo",   updated.tipo);
          setActiveSeg("detail-status", updated.status);
        }
      } catch (err) { console.error(err); }
    });
  });
}

// ─── Edit mode ───────────────────────────────────────────
editBtn.addEventListener("click", enterEditMode);
cancelBtn.addEventListener("click", () => showDetail(currentRecipe));
saveBtn.addEventListener("click", async () => {
  const title      = ($("edit-title-input")?.value    || "").trim();
  const servings   = ($("edit-servings-input")?.value || "").trim();
  const source_url = ($("edit-fonte-input")?.value    || "").trim();
  if (!title) return;

  const ingredients = [...$("d-ingredients").querySelectorAll("li.edit-row")].map(li => ({
    item:     (li.querySelector(".edit-ing-item")?.value || "").trim(),
    quantity: (li.querySelector(".edit-ing-qty")?.value  || "").trim(),
  })).filter(i => i.item);

  const instructions = [...$("d-instructions").querySelectorAll("li.edit-row")]
    .map(li => (li.querySelector(".edit-step")?.value || "").trim())
    .filter(Boolean);

  saveBtn.disabled = true;
  try {
    const updated = await patchJSON(`${API}/recipes/${currentRecipe.slug}`, {
      title, servings, source_url, ingredients, instructions,
    });
    const idx = recipes.findIndex(r => r.slug === updated.slug);
    if (idx !== -1) recipes[idx] = updated;
    renderList(recipes);
    showDetail(updated);
  } catch (err) {
    console.error(err);
  } finally {
    saveBtn.disabled = false;
  }
});

function enterEditMode() {
  editBtn.style.display   = "none";
  saveBtn.style.display   = "inline-block";
  cancelBtn.style.display = "inline-block";

  $("d-title").innerHTML = `<input id="edit-title-input" class="edit-title" value="${esc(currentRecipe.title)}">`;
  $("d-meta").innerHTML  = `<input id="edit-servings-input" class="edit-servings" value="${esc(currentRecipe.servings || "")}" placeholder="Rendimento…">`;

  const _specialSrc = ["texto colado", "foto de livro"];
  const fonteInput = document.createElement("input");
  fonteInput.id = "edit-fonte-input"; fonteInput.type = "url"; fonteInput.className = "edit-fonte";
  fonteInput.value = _specialSrc.includes(currentRecipe.source_url || "") ? "" : (currentRecipe.source_url || "");
  fonteInput.placeholder = "URL da fonte…";
  $("d-meta").after(fonteInput);

  const ingList = $("d-ingredients");
  ingList.innerHTML = currentRecipe.ingredients.map(ing => `
    <li class="edit-row">
      <input class="edit-ing-item" value="${esc(ing.item)}" placeholder="Ingrediente">
      <input class="edit-ing-qty"  value="${esc(ing.quantity)}" placeholder="Qtd.">
      <button class="edit-remove" type="button">×</button>
    </li>`).join("");
  ingList.addEventListener("click", e => {
    if (e.target.classList.contains("edit-remove")) e.target.closest("li").remove();
  });
  const addIngBtn = document.createElement("button");
  addIngBtn.id = "add-ing-btn"; addIngBtn.className = "edit-add-btn"; addIngBtn.textContent = "+ Ingrediente";
  addIngBtn.addEventListener("click", () => {
    const li = document.createElement("li"); li.className = "edit-row";
    li.innerHTML = `<input class="edit-ing-item" placeholder="Ingrediente"><input class="edit-ing-qty" placeholder="Qtd."><button class="edit-remove" type="button">×</button>`;
    ingList.appendChild(li); li.querySelector(".edit-ing-item").focus();
  });
  ingList.after(addIngBtn);

  const instList = $("d-instructions");
  instList.innerHTML = currentRecipe.instructions.map(step => `
    <li class="edit-row">
      <input class="edit-step" value="${esc(step)}">
      <button class="edit-remove" type="button">×</button>
    </li>`).join("");
  instList.addEventListener("click", e => {
    if (e.target.classList.contains("edit-remove")) e.target.closest("li").remove();
  });
  const addStepBtn = document.createElement("button");
  addStepBtn.id = "add-step-btn"; addStepBtn.className = "edit-add-btn"; addStepBtn.textContent = "+ Passo";
  addStepBtn.addEventListener("click", () => {
    const li = document.createElement("li"); li.className = "edit-row";
    li.innerHTML = `<input class="edit-step" placeholder="Passo…"><button class="edit-remove" type="button">×</button>`;
    instList.appendChild(li); li.querySelector(".edit-step").focus();
  });
  instList.after(addStepBtn);

  $("edit-title-input").focus();
}

// ─── Detail view ─────────────────────────────────────────
function showDetail(recipe) {
  currentRecipe = recipe;
  $("add-ing-btn")?.remove();
  $("add-step-btn")?.remove();
  $("edit-fonte-input")?.remove();
  editBtn.style.display   = "inline-block";
  saveBtn.style.display   = "none";
  cancelBtn.style.display = "none";
  listView.classList.add("hidden");
  detailView.classList.add("active");
  backBtn.style.display = "inline-block";
  history.pushState({}, "", `?r=${recipe.slug}`);
  window.scrollTo(0, 0);

  updateDetailPhoto(recipe.image_url);
  $("d-title").textContent = recipe.title;

  const metaParts = [];
  if (recipe.servings) metaParts.push(recipe.servings);
  metaParts.push(fmtDate(recipe.created_at, true));
  $("d-meta").textContent = metaParts.join("  ·  ");

  setActiveSeg("detail-tipo",   recipe.tipo);
  setActiveSeg("detail-status", recipe.status);

  $("d-ingredients").innerHTML = recipe.ingredients.map(i =>
    `<li><span class="ing-item">${esc(i.item)}</span><span class="ing-qty">${esc(i.quantity)}</span></li>`
  ).join("");

  $("d-instructions").innerHTML = recipe.instructions.map(s => `<li>${esc(s)}</li>`).join("");

  const src = $("d-source");
  try { src.href = recipe.source_url; src.textContent = new URL(recipe.source_url).hostname.replace(/^www\./, ""); src.style.display = "inline-block"; }
  catch { src.style.display = "none"; }
}

// ─── Category toggles in detail ──────────────────────────
["detail-tipo", "detail-status"].forEach(groupId => {
  $(groupId).addEventListener("click", async e => {
    const btn = e.target.closest(".seg-btn");
    if (!btn || !currentRecipe) return;
    const field = groupId === "detail-tipo" ? "tipo" : "status";
    const value = btn.dataset.value;
    try {
      const updated = await patchJSON(`${API}/recipes/${currentRecipe.slug}`, { [field]: value });
      currentRecipe = updated;
      const idx = recipes.findIndex(r => r.slug === updated.slug);
      if (idx !== -1) recipes[idx] = updated;
      setActiveSeg(groupId, value);
      // sync row badge
      const rowBtn = recipeList.querySelector(`.row-cat[data-slug="${updated.slug}"][data-field="${field}"]`);
      if (rowBtn) {
        rowBtn.dataset.value = value;
        rowBtn.textContent   = field === "tipo" ? TIPO_LABEL[value] : STATUS_LABEL[value];
        if (field === "status") rowBtn.classList.toggle("ja-fiz", value === "ja_fiz");
      }
    } catch (err) { console.error(err); }
  });
});

// ─── Photo: drag-and-drop ─────────────────────────────────
photoWrap.addEventListener("dragover",  e => { e.preventDefault(); photoWrap.classList.add("drag-over"); });
photoWrap.addEventListener("dragleave", () => photoWrap.classList.remove("drag-over"));
photoWrap.addEventListener("drop", async e => {
  e.preventDefault();
  photoWrap.classList.remove("drag-over");
  const file = e.dataTransfer.files[0];
  if (file?.type.startsWith("image/")) await uploadPhotoFile(file);
});

// ─── Photo: file via label click (native, no JS click needed) ─
photoFileInput.addEventListener("change", async () => {
  const file = photoFileInput.files[0];
  if (file) await uploadPhotoFile(file);
  photoFileInput.value = "";
});

// ─── Photo: URL ───────────────────────────────────────────
$("photo-url-btn").addEventListener("click", e => {
  e.stopPropagation();
  photoUrlRow.style.display = "flex";
  photoUrlInput.focus();
});

$("photo-url-ok").addEventListener("click", async () => {
  const url = photoUrlInput.value.trim();
  if (!url || !currentRecipe) return;
  try {
    const updated = await patchJSON(`${API}/recipes/${currentRecipe.slug}`, { image_url: url });
    currentRecipe = updated;
    const idx = recipes.findIndex(r => r.slug === updated.slug);
    if (idx !== -1) recipes[idx] = updated;
    updateDetailPhoto(url);
    renderList(recipes);
    photoUrlRow.style.display = "none";
    photoUrlInput.value = "";
  } catch (err) { console.error(err); }
});

$("photo-url-cancel").addEventListener("click", () => {
  photoUrlRow.style.display = "none";
  photoUrlInput.value = "";
});

photoUrlInput.addEventListener("keydown", e => { if (e.key === "Enter") $("photo-url-ok").click(); if (e.key === "Escape") $("photo-url-cancel").click(); });

// ─── Upload file helper ───────────────────────────────────
async function uploadPhotoFile(file) {
  if (!currentRecipe) return;
  const form = new FormData();
  form.append("file", file);
  try {
    const res = await fetch(`${API}/recipes/${currentRecipe.slug}/image`, { method: "POST", body: form });
    if (!res.ok) throw new Error("Erro ao enviar foto.");
    const updated = await res.json();
    currentRecipe = updated;
    const idx = recipes.findIndex(r => r.slug === updated.slug);
    if (idx !== -1) recipes[idx] = updated;
    updateDetailPhoto(updated.image_url);
    renderList(recipes);
  } catch (e) { console.error(e); }
}

function updateDetailPhoto(imageUrl) {
  if (imageUrl) {
    dPhoto.src = imageUrl; dPhoto.style.display = "block"; photoPlaceholder.style.display = "none";
    dPhoto.onerror = () => { dPhoto.style.display = "none"; photoPlaceholder.style.display = "flex"; };
  } else {
    dPhoto.style.display = "none"; photoPlaceholder.style.display = "flex";
  }
}

// ─── Back / nav ──────────────────────────────────────────
backBtn.addEventListener("click", showList);
wordmark.addEventListener("click", showList);

function showList() {
  detailView.classList.remove("active"); listView.classList.remove("hidden");
  backBtn.style.display = "none"; currentRecipe = null;
  photoUrlRow.style.display = "none";
  history.pushState({}, "", location.pathname);
}

window.addEventListener("popstate", () => {
  const slug = new URLSearchParams(location.search).get("r");
  if (slug) { const r = recipes.find(x => x.slug === slug); if (r) { showDetail(r); return; } }
  showList();
});

// ─── Helpers ─────────────────────────────────────────────
function setStatus(el, msg, isError = false) { el.textContent = msg; el.className = "status" + (isError ? " error" : ""); }
function esc(s) { return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;"); }
function fmtDate(iso, long = false) { return new Date(iso).toLocaleDateString("pt-BR", { month: long ? "long" : "short", year: "numeric" }); }

init();
