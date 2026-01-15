const LANGS = ["it","en","es","ru","zh"];
const DEFAULT_LANG = "it";

function getSavedLang(){
  const q = new URLSearchParams(location.search).get("lang");
  if (q && LANGS.includes(q)) return q;
  const saved = localStorage.getItem("lang");
  if (saved && LANGS.includes(saved)) return saved;
  return DEFAULT_LANG;
}

async function loadI18n(lang){
  const res = await fetch(`i18n/${lang}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error("i18n load failed");
  return await res.json();
}

function t(dict, key){
  return key.split(".").reduce((acc, part) => (acc && acc[part] != null ? acc[part] : null), dict);
}

function applyTranslations(dict){
  document.querySelectorAll("[data-i18n]").forEach(el => {
    const key = el.getAttribute("data-i18n");
    const val = t(dict, key);
    if (val != null) el.textContent = val;
  });
  document.documentElement.lang = dict?.meta?.langTag || "it";
}

function setActiveNav(){
  const hash = location.hash || "#checkin";
  document.querySelectorAll(".nav-item").forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === hash);
  });
}

async function setLang(lang){
  localStorage.setItem("lang", lang);
  const dict = await loadI18n(lang);
  applyTranslations(dict);

  const sel = document.getElementById("langSelect");
  if (sel) sel.value = lang;

  // mantieni lang nell'URL (utile per QR)
  const url = new URL(location.href);
  url.searchParams.set("lang", lang);
  history.replaceState({}, "", url);

  setActiveNav();
}

window.addEventListener("hashchange", setActiveNav);

document.addEventListener("DOMContentLoaded", async () => {
  const sel = document.getElementById("langSelect");
  sel.addEventListener("change", (e) => setLang(e.target.value));

  setActiveNav();
  await setLang(getSavedLang());
});
