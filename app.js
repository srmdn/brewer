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
  timerRunning: false
};

const FALLBACK_RECIPES = [
  {
    id: "kapal-api-bitter-sweet-bold",
    name: "Kapal Api Bitter-Sweet (Bold)",
    category: "instant",
    description: "Kopi instan dua sachet dengan gula aren bubuk dan es. Takaran awal untuk dicoba.",
    provenance: {
      kind: "experiment", creator: null, verification: "not_recorded", references: [],
      origin: "Diusulkan Gemini dalam diskusi dengan srmdn. Salah satu versi bitter-sweet pernah dicoba dan disukai, tetapi versi dan takaran persisnya belum tercatat."
    },
    temp_c: 80,
    ingredients: [
      { name: "Kopi Instan Murni (2 Sachet)", amount_g: 4.4, role: "coffee" },
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
    const res = await fetch("./data/recipes.json");
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
      return;
    }
  }

  if (state.recipes.length > 0) {
    selectRecipe(state.recipes[0]);
  }
  renderRecipeGrid();
}

function renderRecipeGrid() {
  const grid = document.getElementById("recipeGrid");
  grid.innerHTML = "";

  const filtered = state.recipes.filter((r) => {
    if (state.activeCategory === "all") return true;
    if (state.activeCategory === "local") return Boolean(r.isLocal);
    return r.category === state.activeCategory;
  });

  if (filtered.length === 0) {
    grid.innerHTML = `<p class="meta-text">Belum ada resep di kategori ini.</p>`;
    return;
  }

  filtered.forEach((recipe) => {
    const coffeeItem = recipe.ingredients.find((i) => i.role === "coffee") || recipe.ingredients[0];
    const card = document.createElement("button");
    card.type = "button";
    card.className = "recipe-card" + (state.activeRecipe?.id === recipe.id ? " active" : "");
    card.innerHTML = `
      <div class="recipe-card-title">${escapeHtml(recipe.name)}</div>
      <div class="recipe-card-meta">${recipe.category.toUpperCase()} • Base ${coffeeItem.amount_g}g</div>
    `;
    card.addEventListener("click", () => {
      selectRecipe(recipe);
      renderRecipeGrid();
    });
    grid.appendChild(card);
  });
}

function selectRecipe(recipe) {
  state.activeRecipe = recipe;
  const coffeeItem = recipe.ingredients.find((i) => i.role === "coffee") || recipe.ingredients[0];
  state.baseCoffeeGrams = Number(coffeeItem.amount_g) || 1;
  state.currentCoffeeGrams = state.baseCoffeeGrams;

  document.getElementById("activeCategoryBadge").textContent = recipe.isLocal
    ? `${recipe.category} • lokal`
    : recipe.category;
  document.getElementById("activeAuthor").textContent = recipe.provenance?.creator || recipe.author || "Pembuat belum dicatat";
  document.getElementById("activeTemp").textContent = recipe.temp_c != null ? `${recipe.temp_c}°C` : "Suhu tidak dicatat";
  document.getElementById("activeTitle").textContent = recipe.name;
  document.getElementById("activeDesc").textContent = recipe.description || "";
  renderProvenance(recipe);

  const doseInput = document.getElementById("coffeeDoseInput");
  doseInput.value = state.currentCoffeeGrams;

  document.querySelectorAll(".mult-btn").forEach((btn) => {
    btn.classList.toggle("active", Number(btn.dataset.mult) === 1);
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

function renderSteps() {
  const list = document.getElementById("stepsList");
  list.innerHTML = "";
  (state.activeRecipe?.steps || []).forEach((step) => {
    const li = document.createElement("li");
    li.className = "step-item";
    li.innerHTML = `
      <input type="checkbox" />
      <span>${escapeHtml(step)}</span>
    `;
    const checkbox = li.querySelector("input");
    checkbox.addEventListener("change", () => {
      li.classList.toggle("done", checkbox.checked);
    });
    list.appendChild(li);
  });
}

function formatGrams(num) {
  return Number.isInteger(num) ? num.toString() : num.toFixed(1).replace(/\.0$/, "");
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

function toggleTimer() {
  const btn = document.getElementById("timerStartBtn");
  if (state.timerRunning) {
    clearInterval(state.timerInterval);
    state.timerRunning = false;
    btn.textContent = "Lanjut";
    return;
  }

  state.timerRunning = true;
  btn.textContent = "Jeda";
  state.timerInterval = setInterval(() => {
    if (state.timerMode === "countdown") {
      if (state.timerSeconds > 0) {
        state.timerSeconds--;
        updateTimerDisplay();
      }
      if (state.timerSeconds === 0) {
        clearInterval(state.timerInterval);
        state.timerRunning = false;
        btn.textContent = "Mulai";
        showToast("Timer selesai!");
      }
    } else {
      state.timerSeconds++;
      updateTimerDisplay();
    }
  }, 1000);
}

function resetTimer() {
  clearInterval(state.timerInterval);
  state.timerRunning = false;
  state.timerMode = "stopwatch";
  state.timerSeconds = 0;
  document.getElementById("timerStartBtn").textContent = "Mulai";
  updateTimerDisplay();
}

async function toggleWakeLock() {
  const btn = document.getElementById("wakeLockBtn");
  if (!("wakeLock" in navigator)) {
    showToast("Browser tidak mendukung Screen Wake Lock");
    return;
  }

  if (state.wakeLock) {
    await state.wakeLock.release();
    state.wakeLock = null;
    btn.textContent = "Screen Wake: OFF";
    btn.setAttribute("aria-pressed", "false");
    return;
  }

  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
    btn.textContent = "Screen Wake: ON";
    btn.setAttribute("aria-pressed", "true");
    showToast("Layar dijaga tetap menyala");
  } catch {
    showToast("Gagal mengaktifkan Wake Lock");
  }
}

function addIngredientFormRow(defaultName = "", defaultAmount = "", defaultRole = "liquid") {
  const container = document.getElementById("dynamicIngredients");
  const row = document.createElement("div");
  row.className = "ing-row";
  row.innerHTML = `
    <input type="text" class="ing-name" placeholder="Nama bahan" value="${escapeHtml(defaultName)}" required />
    <input type="number" class="ing-amt" placeholder="Gram" step="0.1" min="0.1" value="${defaultAmount}" required />
    <select class="ing-role">
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
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.category === "all"));

    selectRecipe(newRecipe);
    renderRecipeGrid();
    modal.close();
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
  document.getElementById("themeLabel").textContent = saved === "dark" ? "Light" : "Dark";

  document.getElementById("themeToggle").addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    const next = current === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    localStorage.setItem(THEME_KEY, next);
    document.getElementById("themeLabel").textContent = next === "dark" ? "Light" : "Dark";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initTheme();
  initModal();
  loadAllRecipes();

  document.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      state.activeCategory = chip.dataset.category;
      document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      renderRecipeGrid();
    });
  });

  document.getElementById("coffeeDoseInput").addEventListener("input", (e) => {
    const val = parseFloat(e.target.value);
    if (!isNaN(val) && val > 0) {
      state.currentCoffeeGrams = val;
      document.querySelectorAll(".mult-btn").forEach((b) => b.classList.remove("active"));
      renderCalculation();
    }
  });

  document.querySelectorAll(".mult-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mult = Number(btn.dataset.mult);
      state.currentCoffeeGrams = Number((state.baseCoffeeGrams * mult).toFixed(2));
      document.getElementById("coffeeDoseInput").value = state.currentCoffeeGrams;
      document.querySelectorAll(".mult-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
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
    preset.addEventListener("click", () => {
      clearInterval(state.timerInterval);
      state.timerRunning = false;
      document.getElementById("timerStartBtn").textContent = "Mulai";
      const secs = Number(preset.dataset.seconds);
      if (secs > 0) {
        state.timerMode = "countdown";
        state.timerSeconds = secs;
      } else {
        state.timerMode = "stopwatch";
        state.timerSeconds = 0;
      }
      updateTimerDisplay();
    });
  });
});
