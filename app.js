const GITHUB_CONFIG = {
  owner: "srmdn",
  repo: "brewer"
};

const STORAGE_KEY = "brewer_custom_recipes_v1";
const THEME_KEY = "brewer_theme";

const state = {
  recipes: [],
  activeCategory: "all",
  activeRecipe: null,
  baseCoffeeGrams: 1,
  currentCoffeeGrams: 1,
  sharedRecipeCandidate: null,
  wakeLock: null,
  timerInterval: null,
  timerSeconds: 0,
  timerMode: "stopwatch",
  timerRunning: false,
  timerDeadline: null,
  timerStartedAt: null,
  audioContext: null
};

const FALLBACK_RECIPES = [
  {
    id: "kapal-api-bitter-sweet-bold",
    name: "Kapal Api Bitter-Sweet (Bold)",
    category: "instant",
    description: "Kopi instan dua sachet dengan gula aren bubuk dan es. Takaran awal untuk dicoba.",
    provenance: {
      kind: "experiment", creator: "Said", verification: "not_recorded", references: [],
      origin: "Eksperimen Said."
    },
    temp_c: 80,
    ingredients: [
      { name: "Kopi Instan Murni", amount_g: 4.4, role: "coffee" },
      { name: "Air Panas (Seduh Kopi)", amount_g: 55, role: "liquid" },
      { name: "Gula Aren Bubuk", amount_g: 11, role: "sweetener" },
      { name: "Air Panas (Cairkan Gula)", amount_g: 15, role: "liquid" },
      { name: "Es Batu", amount_g: 75, role: "ice" }
    ],
    steps: [
      "Larutkan 2 sachet kopi dengan 55g air panas (~80°C).",
      "Cairkan 11g gula aren dengan 15g air panas, saring ampasnya.",
      "Campurkan larutan gula aren ke kopi dan tuang di atas 75g es batu."
    ]
  }
];

function encodeRecipeToParam(recipe) {
  const json = JSON.stringify(recipe);
  return btoa(encodeURIComponent(json));
}

function decodeRecipeFromParam(encoded) {
  try {
    if (encoded.length > 30000) return null;
    const json = decodeURIComponent(atob(encoded));
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed.name !== "string" || !parsed.name.trim() ||
        !["beans", "instant", "experimental"].includes(parsed.category) ||
        !Array.isArray(parsed.ingredients) || !parsed.ingredients.length ||
        !parsed.ingredients.every((i) => i && typeof i.name === "string" && i.name.trim() &&
          typeof i.amount_g === "number" && Number.isFinite(i.amount_g) && i.amount_g > 0 &&
          ["coffee", "liquid", "ice", "sweetener", "mixer"].includes(i.role)) ||
        !parsed.ingredients.some((i) => i.role === "coffee") ||
        !Array.isArray(parsed.steps) || !parsed.steps.every((s) => typeof s === "string") ||
        (parsed.author != null && typeof parsed.author !== "string") ||
        (parsed.description != null && typeof parsed.description !== "string") ||
        (parsed.target_yield_g != null && (typeof parsed.target_yield_g !== "number" || !Number.isFinite(parsed.target_yield_g) || parsed.target_yield_g <= 0)) ||
        (parsed.temp_c != null && (typeof parsed.temp_c !== "number" || !Number.isFinite(parsed.temp_c)))) return null;
    // Shared metadata is untrusted. Preserve only well-formed fields.
    if (parsed.provenance) {
      const p = parsed.provenance;
      if (typeof p !== "object" || Array.isArray(p)) return null;
      parsed.provenance = {
        kind: ["experiment", "template", "original", "adaptation"].includes(p.kind) ? p.kind : null,
        creator: typeof p.creator === "string" ? p.creator : null,
        origin: typeof p.origin === "string" ? p.origin : "",
        verification: ["not_recorded", "tested"].includes(p.verification) ? p.verification : "not_recorded",
        references: Array.isArray(p.references) ? p.references.filter((r) => r &&
          typeof r.title === "string" && typeof r.url === "string" &&
          typeof r.relationship === "string").slice(0, 10) : []
      };
    }
    parsed.id = `shared-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    return { ...parsed, isLocal: false };
  } catch {
    return null;
  }
}

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => toast.classList.remove("show"), 2600);
}

function getLocalRecipes() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.map((r) => ({ ...r, isLocal: true })) : [];
  } catch {
    return [];
  }
}

function saveLocalRecipes(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

async function loadAllRecipes() {
  let builtIn = [];
  try {
    const res = await fetch("./data/recipes.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("Failed to load recipes.json");
    builtIn = await res.json();
  } catch {
    builtIn = FALLBACK_RECIPES;
  }

  const local = getLocalRecipes();
  state.recipes = [...local, ...builtIn];

  const params = new URLSearchParams(window.location.search);
  const sharedParam = params.get("r");
  if (sharedParam) {
    const shared = decodeRecipeFromParam(sharedParam);
    if (shared) {
      state.sharedRecipeCandidate = shared;
      document.getElementById("sharedRecipeName").textContent = `${shared.name} (${shared.provenance?.creator || shared.author || "pembuat belum dicatat"})`;
      document.getElementById("sharedBanner").classList.remove("hidden");
      selectRecipe(shared);
      renderRecipeGrid();
      showRecipe();
      return;
    }
  }

  if (state.recipes.length > 0) {
    selectRecipe(state.recipes[0]);
  }
  renderRecipeGrid();
}

const CATEGORY_LABELS = { beans: "Manual Brew", instant: "Kopi Instan", experimental: "Eksperimen" };

function setPressed(button, pressed) {
  button.classList.toggle("active", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function renderRecipeGrid() {
  const grid = document.getElementById("recipeGrid");
  grid.innerHTML = "";

  const query = document.getElementById("recipeSearch").value.trim().toLocaleLowerCase("id");
  const filtered = state.recipes.filter((r) => {
    if (!r.name.toLocaleLowerCase("id").includes(query)) return false;
    if (state.activeCategory === "all") return true;
    if (state.activeCategory === "local") return Boolean(r.isLocal);
    return r.category === state.activeCategory;
  });

  document.getElementById("recipeCount").textContent = `${filtered.length} resep`;
  document.querySelectorAll(".chip").forEach((chip) => {
    setPressed(chip, chip.dataset.category === state.activeCategory);
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="meta-text">Belum ada resep di kategori ini.</p>`;
    return;
  }

  filtered.forEach((recipe) => {
    const coffeeItem = recipe.ingredients.find((i) => i.role === "coffee") || recipe.ingredients[0];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "recipe-card";
    card.dataset.category = recipe.category;
    setPressed(card, state.activeRecipe?.id === recipe.id);
    card.innerHTML = `
      <span class="recipe-card-title">${escapeHtml(recipe.name)}</span>
      <span class="recipe-card-meta">${escapeHtml(CATEGORY_LABELS[recipe.category] || recipe.category)} <span aria-hidden="true">·</span> ${escapeHtml(coffeeItem.amount_g)} g kopi</span>
    `;
    card.addEventListener("click", () => {
      selectRecipe(recipe);
      renderRecipeGrid();
      showRecipe();
    });
    grid.appendChild(card);
  });
}

function showRecipe() {
  document.body.dataset.view = "detail";
  const title = document.getElementById("activeTitle");
  title.focus({ preventScroll: true });
  if (window.matchMedia("(max-width: 760px)").matches) document.getElementById("kalkulator").scrollIntoView({ block: "start" });
}

function selectRecipe(recipe) {
  state.activeRecipe = recipe;
  const coffeeItem = recipe.ingredients.find((i) => i.role === "coffee") || recipe.ingredients[0];
  state.baseCoffeeGrams = Number(coffeeItem.amount_g) || 1;
  state.currentCoffeeGrams = state.baseCoffeeGrams;

  const categoryLabel = CATEGORY_LABELS[recipe.category] || recipe.category;
  document.getElementById("activeCategoryBadge").textContent = recipe.isLocal
    ? `${categoryLabel} • lokal`
    : categoryLabel;
  document.getElementById("activeAuthor").textContent = recipe.provenance?.creator || recipe.author || "Pembuat belum dicatat";
  document.getElementById("activeTemp").textContent = recipe.temp_c != null ? `${recipe.temp_c}°C` : "Suhu tidak dicatat";
  document.getElementById("activeTitle").textContent = recipe.name;
  document.getElementById("activeDesc").textContent = recipe.description || "";
  renderProvenance(recipe);
  const p = recipe.provenance;
  const kind = { experiment: "Eksperimen", template: "Resep contoh", original: "Resep orisinal", adaptation: "Adaptasi" }[p?.kind] || "Asal resep belum dicatat";
  const verification = p?.verification === "tested" ? "sudah diuji" : "pengujian belum dicatat";
  document.getElementById("recipeStatus").textContent = recipe.isLocal
    ? "Resep pribadi · disimpan di browser ini" : `${kind} · ${verification}`;

  const doseInput = document.getElementById("coffeeDoseInput");
  doseInput.value = state.currentCoffeeGrams;
  setDoseValidity(true);

  document.querySelectorAll(".mult-btn").forEach((btn) => {
    setPressed(btn, Number(btn.dataset.mult) === 1);
  });

  const delBtn = document.getElementById("deleteLocalBtn");
  delBtn.classList.toggle("hidden", !recipe.isLocal);

  renderCalculation();
  renderSteps();
}

function renderProvenance(recipe) {
  const p = recipe.provenance;
  const kindLabels = { experiment: "Eksperimen", template: "Contoh", original: "Orisinal", adaptation: "Adaptasi" };
  document.getElementById("recipeKind").textContent = kindLabels[p?.kind] || "Jenis belum dicatat";
  document.getElementById("recipeVerification").textContent = p?.verification === "tested" ? "Sudah diuji" : "Pengujian resep persis belum dicatat";
  document.getElementById("recipeOrigin").textContent = p?.origin || "Asal-usul belum dicatat.";
  const links = document.getElementById("recipeReferences");
  links.replaceChildren();
  if (!Array.isArray(p?.references)) return;
  p.references.forEach((ref) => {
    try {
      const url = new URL(ref.url);
      if (url.protocol !== "https:" || typeof ref.title !== "string") return;
      const item = document.createElement("li");
      const link = document.createElement("a");
      link.href = url.href;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = ref.title;
      item.append(link, document.createTextNode(` — ${ref.relationship || "Referensi"}`));
      links.appendChild(item);
    } catch { /* Ignore malformed reference URLs. */ }
  });
}

function renderCalculation() {
  const recipe = state.activeRecipe;
  if (!recipe) return;

  const scale = state.currentCoffeeGrams / state.baseCoffeeGrams;
  renderScaledStepAmounts(recipe, scale);
  const tbody = document.getElementById("ingredientsBody");
  tbody.innerHTML = "";

  let totalLiquidAndIce = 0;
  let totalSweetener = 0;
  let totalAll = 0;

  recipe.ingredients.forEach((ing) => {
    const scaledAmount = ing.amount_g * scale;
    totalAll += scaledAmount;

    if (["liquid", "ice", "mixer"].includes(ing.role)) {
      totalLiquidAndIce += scaledAmount;
    }
    if (ing.role === "sweetener") {
      totalSweetener += scaledAmount;
    }

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(ing.name)}</td>
      <td><span class="role-pill">${escapeHtml(ing.role)}</span></td>
      <td class="num-col">${formatGrams(scaledAmount)} g</td>
    `;
    tbody.appendChild(tr);
  });

  if (recipe.target_yield_g != null) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>Target hasil espresso</td><td><span class="role-pill">hasil</span></td><td class="num-col">${formatGrams(recipe.target_yield_g * scale)} g</td>`;
    tbody.appendChild(tr);
  }
  document.getElementById("totalYield").textContent = `${formatGrams(totalAll)} g`;

  const ratioVal = state.currentCoffeeGrams > 0 ? (recipe.target_yield_g != null ? recipe.target_yield_g * scale : totalLiquidAndIce) / state.currentCoffeeGrams : 0;
  document.getElementById("ratioLabel").textContent = recipe.target_yield_g != null ? "Rasio Kopi : Hasil Espresso" : "Rasio Kopi : Cairan & Es";
  document.getElementById("brewRatioDisplay").textContent = `1 : ${ratioVal.toFixed(1)}`;

  const sweetPct = totalAll > 0 ? (totalSweetener / totalAll) * 100 : 0;
  const sweetLabel = `${sweetPct.toFixed(1)}%`;
  document.getElementById("sweetnessDisplay").textContent = sweetLabel;
}

function setDoseValidity(valid) {
  const input = document.getElementById("coffeeDoseInput");
  input.setAttribute("aria-invalid", String(!valid));
  document.getElementById("doseError").classList.toggle("hidden", valid);
  document.getElementById("calculationResults").classList.toggle("hidden", !valid);
  if (!valid) {
    document.getElementById("stepsScaledAmounts").classList.add("hidden");
    document.getElementById("stepsScaleNotice").textContent = "Masukkan takaran kopi yang valid untuk melihat hasil skala. Langkah di bawah memakai resep asli.";
  }
}

function renderScaledStepAmounts(recipe, scale) {
  const list = document.getElementById("stepsScaledAmounts");
  const notice = document.getElementById("stepsScaleNotice");
  const changed = Math.abs(scale - 1) > 1e-9;
  list.replaceChildren();
  list.classList.toggle("hidden", !changed);
  if (!changed) {
    notice.textContent = "Angka dalam langkah mengikuti resep asli.";
    return;
  }
  notice.textContent = "Langkah di bawah masih memakai angka resep asli. Gunakan takaran yang disesuaikan berikut; waktu dan suhu tetap mengikuti resep asli.";
  const heading = document.createElement("strong");
  heading.textContent = "Takaran yang disesuaikan";
  const items = document.createElement("ul");
  const amounts = [...recipe.ingredients];
  if (recipe.target_yield_g != null) amounts.push({ name: "Target hasil espresso", amount_g: recipe.target_yield_g });
  amounts.forEach((item) => {
    const row = document.createElement("li");
    const name = document.createElement("span");
    const amount = document.createElement("strong");
    name.textContent = item.name;
    amount.textContent = `${formatGrams(item.amount_g * scale)} g`;
    row.append(name, amount);
    items.appendChild(row);
  });
  list.append(heading, items);
  if (recipe.ingredients.some((item) => /\d/.test(item.name))) {
    const note = document.createElement("p");
    note.className = "steps-scaled-note";
    note.textContent = "Nama bahan mengikuti resep asli; gunakan berat yang tertera untuk takaran baru.";
    list.appendChild(note);
  }
}

function renderSteps() {
  const list = document.getElementById("stepsList");
  list.innerHTML = "";
  (state.activeRecipe?.steps || []).forEach((step) => {
    const li = document.createElement("li");
    li.className = "step-item";
    li.innerHTML = `
      <label><input type="checkbox" /><span>${escapeHtml(step)}</span></label>
    `;
    const checkbox = li.querySelector("input");
    checkbox.addEventListener("change", () => {
      li.classList.toggle("done", checkbox.checked);
    });
    list.appendChild(li);
  });
}

function formatGrams(num) {
  if (num > 0 && num < 0.001) return "<0,001";
  return new Intl.NumberFormat("id-ID", { maximumFractionDigits: 3 }).format(num);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function updateTimerDisplay() {
  const mins = Math.floor(state.timerSeconds / 60);
  const secs = state.timerSeconds % 60;
  document.getElementById("timerDisplay").textContent =
    `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function prepareAudio() {
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if (!Audio) return null;
    state.audioContext ||= new Audio();
    if (state.audioContext.state === "suspended") state.audioContext.resume().catch(() => {});
    return state.audioContext;
  } catch { return null; }
}

function playTimerSound() {
  const context = prepareAudio();
  if (!context) { showToast("Suara tidak didukung browser ini"); return; }
  try {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.18, start + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.46);
  } catch { showToast("Suara tidak dapat diputar"); }
}

function tickTimer() {
  if (!state.timerRunning) return;
  const now = Date.now();
  state.timerSeconds = state.timerMode === "countdown"
    ? Math.max(0, Math.ceil((state.timerDeadline - now) / 1000))
    : Math.floor((now - state.timerStartedAt) / 1000);
  updateTimerDisplay();
  if (state.timerMode === "countdown" && state.timerSeconds === 0) {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    document.getElementById("timerStartBtn").textContent = "Mulai";
    document.getElementById("timerStatus").textContent = "Waktu selesai";
    if (document.getElementById("timerSound").checked) playTimerSound();
  }
}

function toggleTimer() {
  const btn = document.getElementById("timerStartBtn");
  if (state.timerRunning) {
    tickTimer();
    if (!state.timerRunning) return;
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    btn.textContent = "Lanjut";
    return;
  }
  if (state.timerMode === "countdown" && state.timerSeconds <= 0) {
    showToast("Atur waktu hitung mundur terlebih dahulu");
    return;
  }
  if (state.timerMode === "countdown" && document.getElementById("timerSound").checked) prepareAudio();
  document.getElementById("timerStatus").textContent = "";
  state.timerRunning = true;
  const now = Date.now();
  state.timerDeadline = now + state.timerSeconds * 1000;
  state.timerStartedAt = now - state.timerSeconds * 1000;
  btn.textContent = "Jeda";
  state.timerInterval = setInterval(tickTimer, 250);
}

function countdownDuration() {
  const minutes = Number(document.getElementById("timerMinutes").value);
  const seconds = Number(document.getElementById("timerSecs").value);
  if (!Number.isInteger(minutes) || !Number.isInteger(seconds) || minutes < 0 || minutes > 999 || seconds < 0 || seconds > 59) return null;
  return minutes * 60 + seconds;
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerSeconds = state.timerMode === "countdown" ? (countdownDuration() || 0) : 0;
  document.getElementById("timerStartBtn").textContent = "Mulai";
  document.getElementById("timerStatus").textContent = "";
  updateTimerDisplay();
}

async function toggleWakeLock() {
  const btn = document.getElementById("wakeLockBtn");
  if (!("wakeLock" in navigator)) {
    showToast("Browser tidak mendukung Screen Wake Lock");
    return;
  }

  btn.disabled = true;
  try {
    if (state.wakeLock) {
      await state.wakeLock.release();
      return;
    }

    const lock = await navigator.wakeLock.request("screen");
    state.wakeLock = lock;
    btn.setAttribute("aria-pressed", "true");
    lock.addEventListener("release", () => {
      if (state.wakeLock === lock) {
        state.wakeLock = null;
        btn.setAttribute("aria-pressed", "false");
      }
    }, { once: true });
    showToast("Layar dijaga tetap menyala");
  } catch {
    showToast("Pengaturan layar gagal diubah");
  } finally {
    btn.disabled = false;
  }
}

function addIngredientFormRow(defaultName = "", defaultAmount = "", defaultRole = "liquid") {
  const container = document.getElementById("dynamicIngredients");
  const row = document.createElement("div");
  row.className = "ing-row";
  row.innerHTML = `
    <input type="text" class="ing-name" aria-label="Nama bahan" placeholder="Nama bahan" value="${escapeHtml(defaultName)}" required />
    <input type="number" class="ing-amt" aria-label="Berat dalam gram" placeholder="Gram" step="0.1" min="0.1" value="${defaultAmount}" required />
    <select class="ing-role" aria-label="Peran bahan">
      <option value="coffee" ${defaultRole === "coffee" ? "selected" : ""}>coffee</option>
      <option value="liquid" ${defaultRole === "liquid" ? "selected" : ""}>liquid</option>
      <option value="ice" ${defaultRole === "ice" ? "selected" : ""}>ice</option>
      <option value="sweetener" ${defaultRole === "sweetener" ? "selected" : ""}>sweetener</option>
      <option value="mixer" ${defaultRole === "mixer" ? "selected" : ""}>mixer</option>
    </select>
    <button type="button" class="btn btn-ghost btn-sm remove-row-btn" aria-label="Hapus baris">×</button>
  `;
  row.querySelector(".remove-row-btn").addEventListener("click", () => {
    if (container.children.length > 1) row.remove();
  });
  container.appendChild(row);
}

function initModal() {
  const modal = document.getElementById("experimentModal");
  const container = document.getElementById("dynamicIngredients");

  document.getElementById("openModalBtn").addEventListener("click", () => {
    container.innerHTML = "";
    addIngredientFormRow("Kopi / Beans", "15", "coffee");
    addIngredientFormRow("Air", "225", "liquid");
    modal.showModal();
  });

  document.getElementById("closeModalBtn").addEventListener("click", () => modal.close());
  document.getElementById("cancelModalBtn").addEventListener("click", () => modal.close());
  modal.addEventListener("click", (event) => {
    if (event.target !== modal) return;
    const rect = modal.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right ||
        event.clientY < rect.top || event.clientY > rect.bottom) modal.close();
  });
  document.getElementById("addIngredientRowBtn").addEventListener("click", () => addIngredientFormRow());

  document.getElementById("experimentForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("expName").value.trim();
    const author = document.getElementById("expAuthor").value.trim() || "guest";
    const category = document.getElementById("expCategory").value;
    const temp_c = Number(document.getElementById("expTemp").value) || 85;
    const description = document.getElementById("expDesc").value.trim();

    const ingredients = Array.from(container.querySelectorAll(".ing-row")).map((row) => ({
      name: row.querySelector(".ing-name").value.trim(),
      amount_g: Number(row.querySelector(".ing-amt").value),
      role: row.querySelector(".ing-role").value
    }));

    if (ingredients.filter((ingredient) => ingredient.role === "coffee").length !== 1) {
      showToast("Gunakan tepat satu bahan berperan coffee sebagai dasar skala.");
      return;
    }

    const steps = document
      .getElementById("expSteps")
      .value.split("\n")
      .map((s) => s.trim())
      .filter(Boolean);

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    const newRecipe = {
      id: `${slug}-${Date.now().toString(36)}`,
      name,
      category,
      author,
      description,
      temp_c,
      ingredients,
      steps,
      provenance: { kind: "experiment", creator: author, origin: "Resep dibuat oleh pengguna.", verification: "not_recorded", references: [] },
      isLocal: true
    };

    const existing = getLocalRecipes();
    existing.unshift(newRecipe);
    saveLocalRecipes(existing);

    state.recipes.unshift(newRecipe);
    state.activeCategory = "all";

    selectRecipe(newRecipe);
    renderRecipeGrid();
    modal.close();
    showRecipe();
    e.target.reset();
    showToast("Resep eksperimen tersimpan!");
  });
}

function openGitHubSubmission() {
  const recipe = state.activeRecipe;
  if (!recipe) return;

  const cleanRecipe = {
    id: recipe.id,
    name: recipe.name,
    category: recipe.category,
    author: recipe.author || "contributor",
    description: recipe.description || "",
    temp_c: recipe.temp_c ?? null,
    ingredients: recipe.ingredients,
    steps: recipe.steps,
    provenance: recipe.provenance || { kind: "experiment", creator: recipe.author || null, origin: "Asal-usul belum dicatat.", verification: "not_recorded", references: [] },
    ...(recipe.target_yield_g != null ? { target_yield_g: recipe.target_yield_g } : {})
  };

  const title = encodeURIComponent(`[New Recipe] ${cleanRecipe.name}`);
  const body = encodeURIComponent(
    `### Usulan Resep Baru\n\nSilakan tambahkan entri JSON berikut ke \`data/recipes.json\`:\n\n\`\`\`json\n${JSON.stringify(cleanRecipe, null, 2)}\n\`\`\``
  );

  const url = `https://github.com/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/issues/new?title=${title}&body=${body}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY) || "light";
  document.documentElement.setAttribute("data-theme", saved);
  document.getElementById("themeLabel").textContent = saved === "dark" ? "Mode terang" : "Mode gelap";

  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    document.getElementById("themeLabel").textContent = next === "dark" ? "Mode terang" : "Mode gelap";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModal();
  document.body.dataset.view = "catalog";
  loadAllRecipes();

  document.querySelector(".skip-link").addEventListener("click", () => { document.body.dataset.view = "detail"; });
  document.getElementById("recipeSearch").addEventListener("input", renderRecipeGrid);
  document.getElementById("backToCatalog").addEventListener("click", () => {
    document.body.dataset.view = "catalog";
    const selected = document.querySelector(".recipe-card.active") || document.getElementById("catalogTitle");
    selected.focus({ preventScroll: true });
    selected.scrollIntoView({ block: "nearest" });
  });

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.activeCategory = chip.dataset.category;
      renderRecipeGrid();
    });
  });

  document.getElementById("coffeeDoseInput").addEventListener("input", (e) => {
    const val = Number(e.target.value);
    const valid = e.target.value !== "" && Number.isFinite(val) && val >= 0.01 && val <= 1000;
    setDoseValidity(valid);
    document.querySelectorAll(".mult-btn").forEach((b) => setPressed(b, false));
    if (valid) {
      state.currentCoffeeGrams = val;
      renderCalculation();
    }
  });

  document.querySelectorAll(".mult-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mult = Number(btn.dataset.mult);
      state.currentCoffeeGrams = state.baseCoffeeGrams * mult;
      document.getElementById("coffeeDoseInput").value = state.currentCoffeeGrams;
      setDoseValidity(state.currentCoffeeGrams >= 0.01 && state.currentCoffeeGrams <= 1000);
      if (state.currentCoffeeGrams < 0.01 || state.currentCoffeeGrams > 1000) return;
      document.querySelectorAll(".mult-btn").forEach((b) => setPressed(b, b === btn));
      renderCalculation();
    });
  });

  document.getElementById("shareUrlBtn").addEventListener("click", async () => {
    if (!state.activeRecipe) return;
    const encoded = encodeRecipeToParam(state.activeRecipe);
    const shareUrl = `${window.location.origin}${window.location.pathname}?r=${encodeURIComponent(encoded)}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast("Link resep berhasil disalin ke clipboard");
    } catch {
      prompt("Salin link resep berikut:", shareUrl);
    }
  });

  document.getElementById("saveSharedBtn").addEventListener("click", () => {
    if (!state.sharedRecipeCandidate) return;
    state.sharedRecipeCandidate.isLocal = true;
    const existing = getLocalRecipes();
    existing.unshift(state.sharedRecipeCandidate);
    saveLocalRecipes(existing);
    state.recipes.unshift(state.sharedRecipeCandidate);
    document.getElementById("sharedBanner").classList.add("hidden");
    selectRecipe(state.sharedRecipeCandidate);
    state.sharedRecipeCandidate = null;
    renderRecipeGrid();
    showToast("Resep dibagikan disimpan ke koleksi lokal");
  });

  document.getElementById("dismissSharedBtn").addEventListener("click", () => {
    document.getElementById("sharedBanner").classList.add("hidden");
  });

  document.getElementById("deleteLocalBtn").addEventListener("click", () => {
    if (!state.activeRecipe?.isLocal) return;
    const updatedLocal = getLocalRecipes().filter((r) => r.id !== state.activeRecipe.id);
    saveLocalRecipes(updatedLocal);
    state.recipes = state.recipes.filter((r) => r.id !== state.activeRecipe.id);
    if (state.recipes.length > 0) selectRecipe(state.recipes[0]);
    renderRecipeGrid();
    showToast("Resep lokal dihapus");
  });

  document.getElementById("submitGithubBtn").addEventListener("click", openGitHubSubmission);

  document.getElementById("timerStartBtn").addEventListener("click", toggleTimer);
  document.getElementById("timerResetBtn").addEventListener("click", resetTimer);
  document.getElementById("wakeLockBtn").addEventListener("click", toggleWakeLock);

  document.querySelectorAll(".preset-chip").forEach((preset) => {
    setPressed(preset, preset.dataset.mode === "stopwatch");
    preset.addEventListener("click", () => {
      document.querySelectorAll(".preset-chip").forEach((p) => setPressed(p, p === preset));
      state.timerMode = preset.dataset.mode;
      document.getElementById("countdownSettings").classList.toggle("hidden", state.timerMode !== "countdown");
      document.getElementById("soundControls").classList.toggle("hidden", state.timerMode !== "countdown");
      resetTimer();
    });
  });
  ["timerMinutes", "timerSecs"].forEach((id) => document.getElementById(id).addEventListener("input", () => {
    if (state.timerMode === "countdown") resetTimer();
  }));
  document.getElementById("testSound").addEventListener("click", playTimerSound);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) tickTimer(); });
});
