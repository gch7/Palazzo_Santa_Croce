const LANGS = ["it","en","es","ru","zh"];
const DEFAULT_LANG = "it";
let activeDict = null;

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

function msg(key, fallback){
  return t(activeDict, key) || fallback;
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

const DAIKIN_STORAGE_KEY = "daikinConfig";

function getDaikinConfig(){
  const raw = localStorage.getItem(DAIKIN_STORAGE_KEY);
  if (!raw) return null;
  try{
    return JSON.parse(raw);
  }catch{
    return null;
  }
}

function saveDaikinConfig(config){
  localStorage.setItem(DAIKIN_STORAGE_KEY, JSON.stringify(config));
}

function parseDeviceIds(value){
  return value
    .split(/[\n,]+/)
    .map(id => id.trim())
    .filter(Boolean);
}

function setDaikinStatus(el, message, type = "info"){
  if (!el) return;
  el.textContent = message;
  el.dataset.status = type;
}

function initDaikinController(){
  const form = document.getElementById("daikinConfigForm");
  if (!form) return;

  const baseUrlInput = document.getElementById("daikinBaseUrl");
  const tokenInput = document.getElementById("daikinToken");
  const devicesInput = document.getElementById("daikinDevices");
  const endpointInput = document.getElementById("daikinEndpoint");
  const saveStatus = document.getElementById("daikinSaveStatus");

  const modeInput = document.getElementById("daikinMode");
  const tempInput = document.getElementById("daikinTemp");
  const timerInput = document.getElementById("daikinTimer");
  const sendButton = document.getElementById("daikinSend");
  const sendStatus = document.getElementById("daikinSendStatus");

  const saved = getDaikinConfig();
  if (saved){
    if (saved.baseUrl) baseUrlInput.value = saved.baseUrl;
    if (saved.token) tokenInput.value = saved.token;
    if (saved.devices) devicesInput.value = saved.devices.join(", ");
    if (saved.endpoint) endpointInput.value = saved.endpoint;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const config = {
      baseUrl: baseUrlInput.value.trim(),
      token: tokenInput.value.trim(),
      devices: parseDeviceIds(devicesInput.value),
      endpoint: endpointInput.value.trim() || "/api/v1/units/{id}/commands"
    };
    saveDaikinConfig(config);
    setDaikinStatus(saveStatus, msg("sections.climate.status.saved", "Configurazione salvata."), "success");
  });

  sendButton.addEventListener("click", async () => {
    const config = getDaikinConfig() || {
      baseUrl: baseUrlInput.value.trim(),
      token: tokenInput.value.trim(),
      devices: parseDeviceIds(devicesInput.value),
      endpoint: endpointInput.value.trim() || "/api/v1/units/{id}/commands"
    };

    if (!config.baseUrl || config.devices.length === 0){
      setDaikinStatus(sendStatus, msg("sections.climate.status.missingConfig", "Inserisci base URL e almeno un dispositivo."), "error");
      return;
    }

    const payload = {
      mode: modeInput.value,
      targetTemperature: Number(tempInput.value),
      timerMinutes: Number(timerInput.value)
    };

    const baseUrl = config.baseUrl.replace(/\/+$/,"");
    const headers = {
      "Content-Type": "application/json"
    };
    if (config.token){
      headers.Authorization = `Bearer ${config.token}`;
    }

    setDaikinStatus(sendStatus, msg("sections.climate.status.sending", "Invio comandi in corso…"), "info");

    try{
      const results = await Promise.all(config.devices.map(async (deviceId) => {
        const endpoint = (config.endpoint || "/api/v1/units/{id}/commands").replace("{id}", encodeURIComponent(deviceId));
        const url = `${baseUrl}${endpoint.startsWith("/") ? "" : "/"}${endpoint}`;
        const res = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(payload)
        });
        return { deviceId, ok: res.ok };
      }));

      const successCount = results.filter(r => r.ok).length;
      const failCount = results.length - successCount;
      if (failCount === 0){
        setDaikinStatus(
          sendStatus,
          msg("sections.climate.status.success", `Comandi inviati a ${successCount} dispositivi.`).replace("{count}", successCount),
          "success"
        );
      }else{
        setDaikinStatus(
          sendStatus,
          msg("sections.climate.status.partial", `Comandi inviati a ${successCount} dispositivi, ${failCount} errori.`)
            .replace("{success}", successCount)
            .replace("{failed}", failCount),
          "warning"
        );
      }
    }catch (error){
      setDaikinStatus(sendStatus, msg("sections.climate.status.error", "Errore durante l'invio dei comandi."), "error");
    }
  });
}

async function setLang(lang){
  localStorage.setItem("lang", lang);
  const dict = await loadI18n(lang);
  applyTranslations(dict);
  activeDict = dict;

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
  initDaikinController();
});
