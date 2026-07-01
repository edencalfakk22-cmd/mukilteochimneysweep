/* Emerald City Builders — progressive enhancement + conversion tracking.
   Deferred, no framework, fully usable without JS. Paste real IDs below to go live;
   nothing loads / no cookies until then (privacy-friendly default). */
var EC_CONFIG = { GTM_ID: "", GA4_ID: "", ADS_ID: "", ADS_CALL_LABEL: "" };

(function () {
  "use strict";
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag("consent", "default", { ad_storage: "denied", analytics_storage: "denied", ad_user_data: "denied", ad_personalization: "denied", wait_for_update: 500 });
  try { if (localStorage.getItem("ec_consent") === "granted") gtag("consent", "update", { ad_storage: "granted", analytics_storage: "granted", ad_user_data: "granted", ad_personalization: "granted" }); } catch (e) {}

  function loadScript(src) { var s = document.createElement("script"); s.async = true; s.src = src; document.head.appendChild(s); }
  if (EC_CONFIG.GTM_ID) {
    (function (w, d, i) { w.dataLayer.push({ "gtm.start": +new Date(), event: "gtm.js" }); var f = d.getElementsByTagName("script")[0], j = d.createElement("script"); j.async = true; j.src = "https://www.googletagmanager.com/gtm.js?id=" + i; f.parentNode.insertBefore(j, f); })(window, document, EC_CONFIG.GTM_ID);
  } else if (EC_CONFIG.GA4_ID || EC_CONFIG.ADS_ID) {
    var firstId = EC_CONFIG.GA4_ID || EC_CONFIG.ADS_ID; loadScript("https://www.googletagmanager.com/gtag/js?id=" + firstId);
    gtag("js", new Date()); if (EC_CONFIG.GA4_ID) gtag("config", EC_CONFIG.GA4_ID); if (EC_CONFIG.ADS_ID) gtag("config", EC_CONFIG.ADS_ID, { allow_enhanced_conversions: true });
  }

  function track(name, params) {
    var data = Object.assign({ event: name }, params || {});
    window.dataLayer.push(data);
    if (EC_CONFIG.GA4_ID && window.gtag) window.gtag("event", name, data);
    if (EC_CONFIG.ADS_CALL_LABEL && window.gtag && (name === "phone_click" || name === "generate_lead")) window.gtag("event", "conversion", { send_to: EC_CONFIG.ADS_CALL_LABEL });
  }
  window.ecTrack = track;

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a"); if (!a) return;
    var href = (a.getAttribute("href") || "").toLowerCase();
    if (href.indexOf("tel:") === 0) track("phone_click", { phone: href.replace("tel:", "") });
    else if (href.indexOf("sms:") === 0) track("sms_click");
    else if (a.hasAttribute("data-book") || /\/(estimate|book|contact)(\/|$|#|\?)/.test(href)) track("book_click");
  }, true);

  var quote = document.querySelector("form.quote-form");
  if (quote) quote.addEventListener("submit", function () {
    if (!quote.checkValidity()) return;
    track("generate_lead", { form: "estimate", currency: "USD", value: 100 });
    var b = quote.querySelector('button[type="submit"]'); if (b) { b.disabled = true; b.textContent = "Sending…"; }
  });

  var btn = document.querySelector(".menu-btn"), links = document.querySelector(".nav-links");
  if (btn && links) {
    btn.addEventListener("click", function () { var o = links.classList.toggle("open"); btn.setAttribute("aria-expanded", o ? "true" : "false"); btn.setAttribute("aria-label", o ? "Close menu" : "Open menu"); });
    links.addEventListener("click", function (e) { if (e.target.tagName === "A") links.classList.remove("open"); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && links.classList.contains("open")) { links.classList.remove("open"); btn.setAttribute("aria-expanded", "false"); btn.focus(); } });
  }
  var header = document.querySelector("header.site");
  if (header) { var on = false, tick = false; var ap = function () { var w = window.scrollY > 8; if (w !== on) { on = w; header.style.boxShadow = w ? "0 6px 20px rgba(0,0,0,.25)" : "none"; } tick = false; }; window.addEventListener("scroll", function () { if (!tick) { tick = true; requestAnimationFrame(ap); } }, { passive: true }); ap(); }
  var faqs = document.querySelectorAll(".faq details"), closing = false;
  Array.prototype.forEach.call(faqs, function (d) { d.addEventListener("toggle", function () { if (closing || !d.open) return; closing = true; Array.prototype.forEach.call(faqs, function (o) { if (o !== d && o.open) o.open = false; }); closing = false; }); });
})();
