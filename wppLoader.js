(() => {
  const LOADER_FLAG = "__WHATSDOWNLOAD_WPP_LOADER__";
  const BRIDGE_NONCE_KEY = "__WHATSDOWNLOAD_BRIDGE_NONCE__";
  const WA_SCRIPT_ID = "whatsdownload-wa-script";
  const INJECT_SCRIPT_ID = "whatsdownload-inject-script";
  const LOAD_DELAY_MS = 3000;
  const MAX_ATTEMPTS = 10;
  const RETRY_INTERVAL_MS = 1000;

  if (window[LOADER_FLAG]) {
    return;
  }

  window[LOADER_FLAG] = true;

  function getBridgeNonce() {
    if (!window[BRIDGE_NONCE_KEY]) {
      window[BRIDGE_NONCE_KEY] =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return window[BRIDGE_NONCE_KEY];
  }

  function injectScriptOnce(id, src, onLoad, dataset) {
    if (document.getElementById(id)) {
      if (typeof onLoad === "function") {
        onLoad();
      }
      return;
    }

    const script = document.createElement("script");
    script.id = id;
    script.src = src;

    if (dataset && typeof dataset === "object") {
      Object.keys(dataset).forEach((key) => {
        script.dataset[key] = dataset[key];
      });
    }

    script.onload = () => {
      if (typeof onLoad === "function") {
        onLoad();
      }
    };

    (document.head || document.documentElement).appendChild(script);
  }

  function injectPageBridge() {
    injectScriptOnce(
      INJECT_SCRIPT_ID,
      chrome.runtime.getURL("inject.js"),
      null,
      { wdNonce: getBridgeNonce() }
    );
  }

  function loadWPPLibrary() {
    // @ts-ignore
    if (window.WPPMP) {
      injectPageBridge();
      return;
    }

    // @ts-ignore
    injectScriptOnce(WA_SCRIPT_ID, chrome.runtime.getURL("wa.js"), () => {
      window.setTimeout(() => {
        injectPageBridge();
      }, LOAD_DELAY_MS);
    });
  }

  function checkWhatsAppReady() {
    const selectors = [
      "#app",
      "div[tabindex='-1']",
      "[data-testid='chat-list-search']",
      "[data-testid='conversation-compose-box-input']",
    ];

    return selectors.some((selector) => document.querySelector(selector));
  }

  let loadAttempts = 0;

  function tryLoadWPP() {
    loadAttempts += 1;

    if (checkWhatsAppReady() || loadAttempts > MAX_ATTEMPTS) {
      loadWPPLibrary();
      return;
    }

    window.setTimeout(tryLoadWPP, RETRY_INTERVAL_MS);
  }

  tryLoadWPP();
})();
