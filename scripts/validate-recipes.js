const fs = require("node:fs");

const recipes = JSON.parse(fs.readFileSync("data/recipes.json", "utf8"));
const categories = ["beans", "instant", "experimental"];
const roles = ["coffee", "liquid", "ice", "sweetener", "mixer"];
const kinds = ["experiment", "template", "original", "adaptation"];
const statuses = ["not_recorded", "tested"];
const ids = new Set();
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const positive = (value) => typeof value === "number" && Number.isFinite(value) && value > 0;
const fail = (id, message) => { throw new Error(`${id || "dataset"}: ${message}`); };

if (!Array.isArray(recipes) || recipes.length === 0) fail(null, "harus berupa array tidak kosong");
for (const recipe of recipes) {
  const id = recipe?.id;
  if (!nonempty(id) || !nonempty(recipe.name) || ids.has(id)) fail(id, "ID/nama kosong atau ID duplikat");
  ids.add(id);
  if (!categories.includes(recipe.category)) fail(id, "kategori tidak valid");
  if (!Array.isArray(recipe.ingredients) || !recipe.ingredients.length ||
      !recipe.ingredients.every((item) => item && nonempty(item.name) && positive(item.amount_g) && roles.includes(item.role)) ||
      recipe.ingredients.filter((item) => item.role === "coffee").length !== 1) fail(id, "bahan tidak valid atau bukan tepat satu bahan kopi");
  if (recipe.target_yield_g != null && !positive(recipe.target_yield_g)) fail(id, "target hasil tidak valid");
  if (recipe.temp_c != null && (typeof recipe.temp_c !== "number" || !Number.isFinite(recipe.temp_c))) fail(id, "suhu tidak valid");
  if (!Array.isArray(recipe.steps) || !recipe.steps.length || !recipe.steps.every(nonempty)) fail(id, "langkah tidak valid");
  const p = recipe.provenance;
  if (!p || !kinds.includes(p.kind) || !(p.creator === null || nonempty(p.creator)) ||
      !nonempty(p.origin) || !statuses.includes(p.verification) || !Array.isArray(p.references)) fail(id, "asal-usul tidak lengkap");
  for (const ref of p.references) {
    if (!ref || !nonempty(ref.title) || !nonempty(ref.relationship)) fail(id, "referensi tidak lengkap");
    try { if (new URL(ref.url).protocol !== "https:") throw new Error(); }
    catch { fail(id, "URL referensi harus HTTPS yang valid"); }
  }
}
console.log(`Validasi struktur berhasil: ${recipes.length} resep.`);
