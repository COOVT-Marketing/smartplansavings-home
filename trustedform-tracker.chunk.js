(function (w, d) {
  "use strict";
  var _p = [56, 54, 54, 53, 52, 55, 51, 53, 50, 57];
  function _phone() {
    return "+" + "1" + _p.map(function (c) { return String.fromCharCode(c); }).join("");
  }
  function _display() {
    var n = _p.map(function (c) { return String.fromCharCode(c); }).join("");
    return "(" + n.slice(0, 3) + ") " + n.slice(3, 6) + "-" + n.slice(6);
  }
  var WEBHOOK = "https://script.google.com/macros/s/AKfycbz-vS8Twpb_qA_tATWzuFTclVa0fpRrvpnJPCVyPhswB0ru1SoLdvRWa0YH750sYSU/exec";
  var VER = "1.6.0";
  var IP_CACHE = null;
  var CERT_MS = 200;
  var CERT_MAX = 50;
  var CACHED_CERT = "";
  var CACHED_PING = "";
  var SENDING = false;

  function readField(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var el = d.querySelector(selectors[i]);
      if (el && el.value && String(el.value).trim().length > 0) {
        return String(el.value).trim();
      }
    }
    return "";
  }

  function readCertFromDom() {
    var v = readField([
      'input[name="xxTrustedFormCertUrl"]',
      "input#xxTrustedFormCertUrl",
      'input[name="trustedform_cert_url"]',
      "input.tf-cert",
      'input[name*="TrustedFormCert"]',
      'input[id*="TrustedFormCert"]'
    ]);
    if (v && v.indexOf("http") === 0) return v;
    if (typeof w.xxTrustedFormCertUrl === "string" && w.xxTrustedFormCertUrl.indexOf("http") === 0) {
      return w.xxTrustedFormCertUrl;
    }
    if (w.trustedForm && typeof w.trustedForm.certUrl === "string") return w.trustedForm.certUrl;
    if (w.TrustedForm && typeof w.TrustedForm.certUrl === "string") return w.TrustedForm.certUrl;
    return v || "";
  }

  function readPingFromDom() {
    var v = readField([
      'input[name="xxTrustedFormPingUrl"]',
      "input#xxTrustedFormPingUrl",
      'input[name="xxTrustedFormToken"]',
      "input#xxTrustedFormToken",
      'input[name*="TrustedFormPing"]',
      'input[id*="TrustedFormPing"]',
      'input[name*="TrustedFormToken"]',
      'input[id*="TrustedFormToken"]'
    ]);
    if (v) return v;
    if (typeof w.xxTrustedFormPingUrl === "string" && w.xxTrustedFormPingUrl) return w.xxTrustedFormPingUrl;
    if (typeof w.xxTrustedFormToken === "string" && w.xxTrustedFormToken) return w.xxTrustedFormToken;
    if (w.trustedForm) {
      if (typeof w.trustedForm.pingUrl === "string") return w.trustedForm.pingUrl;
      if (typeof w.trustedForm.token === "string") return w.trustedForm.token;
    }
    if (w.TrustedForm) {
      if (typeof w.TrustedForm.pingUrl === "string") return w.TrustedForm.pingUrl;
      if (typeof w.TrustedForm.token === "string") return w.TrustedForm.token;
    }
    return "";
  }

  function refreshTf() {
    var c = readCertFromDom();
    var p = readPingFromDom();
    if (c) CACHED_CERT = c;
    if (p) CACHED_PING = p;
    return { cert: CACHED_CERT, ping: CACHED_PING };
  }

  function startCertWatch() {
    var n = 0;
    var t = setInterval(function () {
      refreshTf();
      n++;
      if (n >= CERT_MAX || CACHED_CERT) clearInterval(t);
    }, CERT_MS);
  }

  function waitTf(ms) {
    return new Promise(function (resolve) {
      var start = Date.now();
      (function poll() {
        var r = refreshTf();
        if (r.cert || Date.now() - start >= ms) resolve(r);
        else setTimeout(poll, CERT_MS);
      })();
    });
  }

  function resolveIp() {
    if (IP_CACHE) return Promise.resolve(IP_CACHE);
    return fetch("https://api.ipify.org?format=json")
      .then(function (r) { return r.json(); })
      .then(function (j) {
        IP_CACHE = (j && j.ip) || "";
        return IP_CACHE;
      })
      .catch(function () { return ""; });
  }

  function fmtTs(d) {
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0") +
      " " +
      String(d.getHours()).padStart(2, "0") +
      ":" +
      String(d.getMinutes()).padStart(2, "0") +
      ":" +
      String(d.getSeconds()).padStart(2, "0")
    );
  }

  /* type: "ctc" → Google Sheet tab "ctc quote" */
  function payload(callId, cert, ping, ip) {
    var now = new Date();
    return {
      type: "ctc",
      tab: "ctc quote",
      timestamp: fmtTs(now),
      callId: callId || "unknown",
      phone: _phone(),
      trustedFormCert: cert || "",
      trustedFormPing: ping || "",
      ipAddress: ip || "",
      pageUrl: w.location.href,
      userAgent: navigator.userAgent || ""
    };
  }

  function send(data) {
    if (SENDING) return;
    SENDING = true;
    setTimeout(function () { SENDING = false; }, 3000);
    var body = JSON.stringify(data);
    try {
      if (navigator.sendBeacon) {
        var ok = navigator.sendBeacon(WEBHOOK, new Blob([body], { type: "text/plain;charset=utf-8" }));
        if (ok) return;
      }
    } catch (e) {}
    try {
      fetch(WEBHOOK, {
        method: "POST",
        mode: "no-cors",
        keepalive: true,
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: body
      }).catch(function () {});
    } catch (e) {}
  }

  function onCall(e) {
    var t = e.currentTarget || e.target.closest("a[data-call-id], [data-call-id]");
    if (!t) return;
    var id = t.getAttribute("data-call-id") || "unlabeled";
    e.preventDefault();
    if (SENDING) {
      w.location.href = "tel:" + _phone();
      return;
    }
    Promise.all([waitTf(CERT_MAX * CERT_MS), resolveIp()]).then(function (r) {
      var tf = r[0];
      var ip = r[1];
      send(payload(id, tf.cert, tf.ping, ip));
      setTimeout(function () {
        w.location.href = "tel:" + _phone();
      }, 50);
    });
  }

  function bind(root) {
    var nodes = (root || d).querySelectorAll("[data-call-id]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].__tf) continue;
      nodes[i].__tf = 1;
      nodes[i].addEventListener("click", onCall, { passive: false });
    }
  }

  function hydratePhones() {
    var nodes = d.querySelectorAll("[data-phone-display]");
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = _display();
    }
  }

  function ensureTfForm() {
    var f = d.getElementById("tfLeadForm");
    if (!f) {
      f = d.createElement("form");
      f.id = "tfLeadForm";
      f.name = "lead";
      f.method = "post";
      f.action = "#";
      f.style.cssText = "position:absolute;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;opacity:0;";
      f.setAttribute("aria-hidden", "true");
      f.tabIndex = -1;
      d.body.appendChild(f);
    }
    function ensureInput(name, id) {
      var el = d.getElementById(id) || f.querySelector('input[name="' + name + '"]');
      if (!el) {
        el = d.createElement("input");
        el.type = "hidden";
        el.name = name;
        el.id = id;
        el.value = "";
        f.appendChild(el);
      }
      return el;
    }
    ensureInput("xxTrustedFormCertUrl", "xxTrustedFormCertUrl");
    ensureInput("xxTrustedFormPingUrl", "xxTrustedFormPingUrl");
    ensureInput("xxTrustedFormToken", "xxTrustedFormToken");
    ensureInput("trustedform_cert_url", "trustedform_cert_url");
  }

  function init() {
    ensureTfForm();
    startCertWatch();
    hydratePhones();
    bind(d);
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(function (m) {
        for (var i = 0; i < m.length; i++) {
          if (m[i].addedNodes && m[i].addedNodes.length) {
            bind(d);
            refreshTf();
            break;
          }
        }
      }).observe(d.documentElement, { childList: true, subtree: true });
    }
  }

  w.__TFTracker = {
    init: init,
    version: VER,
    phone: _phone,
    webhook: WEBHOOK,
    readCert: readCertFromDom,
    readPing: readPingFromDom,
    refreshTf: refreshTf,
    waitTf: waitTf,
    resolveIp: resolveIp,
    fmtTs: fmtTs,
    send: send
  };

  if (d.readyState === "loading") d.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : this, document);
