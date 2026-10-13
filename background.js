/* global ExtPay, importScripts, chrome */

importScripts("ExtPay.js");

const EXTPAY_EXTENSION_ID = "whatsdownload";
const TRIAL_DURATION_MS = 24 * 60 * 60 * 1000;
const TRIAL_CONTACT_LIMIT = 50;
const TRIAL_EXPORT_STORAGE_KEY = "trial_export_used_by_email";
// @ts-ignore
const extpay = ExtPay(EXTPAY_EXTENSION_ID);

extpay.startBackground();

function parseTrialStartedAt(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getTrialUserKey(user) {
  const email = String(user?.email || "").trim().toLowerCase();
  if (email) return email;
  const apiKey = String(user?.apiKey || user?.extensionpay_api_key || "").trim();
  return apiKey || null;
}

function isTrialExportUsed(usageMap, userKey) {
  if (!userKey || !usageMap || typeof usageMap !== "object") {
    return false;
  }
  return Boolean(usageMap[userKey]);
}

function getStorage(keys) {
  return new Promise((resolve) => {
    // @ts-ignore
    chrome.storage.local.get(keys, (data) => {
      resolve(data || {});
    });
  });
}

function setStorage(items) {
  return new Promise((resolve) => {
    // @ts-ignore
    chrome.storage.local.set(items, () => resolve());
  });
}

function normalizeExtPayUser(user, trialExportUsed) {
  if (!user) {
    return {
      paid: false,
      registered: false,
      registrationRequired: true,
      plan: "unregistered",
      trialActive: false,
      trialExportAvailable: false,
      canExport: false,
      exportLimit: 0,
      trialEndsAt: null,
    };
  }

  if (user.paid === true) {
    return {
      ...user,
      paid: true,
      registered: true,
      registrationRequired: false,
      plan: "paid",
      trialActive: false,
      trialExportAvailable: false,
      canExport: true,
      exportLimit: null,
      trialEndsAt: null,
    };
  }

  const isRegistered = Boolean(user.email && user.trialStartedAt);
  if (!isRegistered) {
    return {
      ...user,
      paid: false,
      registered: false,
      registrationRequired: true,
      plan: "unregistered",
      trialActive: false,
      trialExportAvailable: false,
      canExport: false,
      exportLimit: 0,
      trialEndsAt: null,
    };
  }

  const trialStartedAt = parseTrialStartedAt(user.trialStartedAt);
  const trialEndsAt = trialStartedAt
    ? new Date(trialStartedAt.getTime() + TRIAL_DURATION_MS)
    : null;
  const trialActive = trialEndsAt ? Date.now() < trialEndsAt.getTime() : false;
  const trialExportAvailable = trialActive && !trialExportUsed;
  const trialBlocked = !trialActive || trialExportUsed;

  return {
    ...user,
    paid: false,
    registered: true,
    registrationRequired: false,
    plan: trialBlocked ? "trial_blocked" : "trial",
    trialActive,
    trialExportAvailable,
    canExport: trialExportAvailable,
    exportLimit: trialExportAvailable ? TRIAL_CONTACT_LIMIT : 0,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
  };
}

async function buildPlanInfo(rawUser) {
  const storage = await getStorage({
    [TRIAL_EXPORT_STORAGE_KEY]: {},
    extensionpay_api_key: null,
  });
  const usageMap = storage[TRIAL_EXPORT_STORAGE_KEY] || {};
  const user = rawUser ? { ...rawUser } : null;

  if (user && !user.apiKey && storage.extensionpay_api_key) {
    user.apiKey = storage.extensionpay_api_key;
  }

  const userKey = getTrialUserKey(user);
  const trialExportUsed = isTrialExportUsed(usageMap, userKey);

  return normalizeExtPayUser(user, trialExportUsed);
}

function saveCachedUser(user, callback) {
  // @ts-ignore
  chrome.storage.local.set({ extpay_user: user }, () => {
    if (typeof callback === "function") {
      callback(user);
    }
  });
}

function refreshExtPayUserAndSave(callback) {
  extpay
    .getUser()
    .then(async (user) => {
      const planInfo = await buildPlanInfo(user || null);
      saveCachedUser(planInfo, callback);
    })
    .catch(async () => {
      const data = await getStorage({ extpay_user: null });
      const planInfo = await buildPlanInfo(data.extpay_user);
      saveCachedUser(planInfo, callback);
    });
}

async function getCachedUser() {
  const data = await getStorage({ extpay_user: null });
  return buildPlanInfo(data.extpay_user);
}

function toBase64Utf8(value) {
  const utf8Bytes = new TextEncoder().encode(String(value || ""));
  let binary = "";

  utf8Bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary);
}

async function recordTrialExportForUser(rawUser) {
  const planInfo = await buildPlanInfo(rawUser);

  if (planInfo.plan !== "trial" || !planInfo.trialExportAvailable) {
    return { ok: false, error: "Trial export is not available." };
  }

  const userKey = getTrialUserKey(rawUser);
  if (!userKey) {
    return { ok: false, error: "Could not identify trial user." };
  }

  const storage = await getStorage({ [TRIAL_EXPORT_STORAGE_KEY]: {} });
  const usageMap = { ...(storage[TRIAL_EXPORT_STORAGE_KEY] || {}) };
  usageMap[userKey] = new Date().toISOString();
  await setStorage({ [TRIAL_EXPORT_STORAGE_KEY]: usageMap });

  const updatedPlanInfo = await buildPlanInfo(rawUser);
  saveCachedUser(updatedPlanInfo);

  return { ok: true, user: updatedPlanInfo };
}

refreshExtPayUserAndSave();

// @ts-ignore
chrome.runtime.onStartup.addListener(() => {
  refreshExtPayUserAndSave();
});

// @ts-ignore
chrome.runtime.onInstalled.addListener(() => {
  refreshExtPayUserAndSave();
});

// @ts-ignore
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extpayGetUser") {
    let responded = false;

    function reply(user) {
      if (responded) return;
      responded = true;
      sendResponse({ user });
    }

    const timeoutId = setTimeout(() => {
      getCachedUser().then(reply);
    }, 8000);

    refreshExtPayUserAndSave(async () => {
      clearTimeout(timeoutId);
      const user = await getCachedUser();
      reply(user);
    });

    return true;
  }

  if (request.action === "recordTrialExport") {
    extpay
      .getUser()
      .then((user) => recordTrialExportForUser(user || null))
      .then((result) => sendResponse(result))
      .catch(async () => {
        const data = await getStorage({ extpay_user: null });
        const result = await recordTrialExportForUser(data.extpay_user);
        sendResponse(result);
      });

    return true;
  }

  if (request.action === "extpayOpenPaymentPage") {
    extpay
      .openPaymentPage()
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error?.message || String(error),
        })
      );

    return true;
  }

  if (request.action === "extpayOpenTrialPage") {
    extpay
      .openTrialPage("1 day")
      .then(() => sendResponse({ ok: true }))
      .catch((error) =>
        sendResponse({
          ok: false,
          error: error?.message || String(error),
        })
      );

    return true;
  }

  if (request.action === "downloadExportFile") {
    const mimeType = String(request.mimeType || "text/plain");
    const filename = String(request.filename || "contacts.txt");
    const content = String(request.content || "");
    const base64Content = toBase64Utf8(content);
    const dataUrl = `data:${mimeType};base64,${base64Content}`;

    // @ts-ignore
    chrome.downloads.download(
      {
        url: dataUrl,
        filename,
        saveAs: false,
        conflictAction: "uniquify",
      },
      (downloadId) => {
        // @ts-ignore
        if (chrome.runtime.lastError) {
          sendResponse({
            ok: false,
            // @ts-ignore
            error: chrome.runtime.lastError.message || "Could not export the file.",
          });
          return;
        }

        const timeoutId = setTimeout(() => {
          // @ts-ignore
          chrome.downloads.onChanged.removeListener(changeListener);
          sendResponse({
            ok: false,
            error: "Download confirmation timed out.",
          });
        }, 20000);

        function finish(response) {
          clearTimeout(timeoutId);
          // @ts-ignore
          chrome.downloads.onChanged.removeListener(changeListener);
          sendResponse(response);
        }

        function changeListener(delta) {
          if (delta.id !== downloadId) {
            return;
          }

          if (delta.state?.current === "complete") {
            finish({
              ok: true,
              downloadId,
            });
            return;
          }

          if (delta.state?.current === "interrupted") {
            finish({
              ok: false,
              error: delta.error?.current || "Download was interrupted.",
            });
          }
        }

        // @ts-ignore
        chrome.downloads.onChanged.addListener(changeListener);
      }
    );

    return true;
  }

  return false;
});

const WHATSAPP_URL_PATTERN = "*://web.whatsapp.com/*";
const WHATSAPP_URL = "https://web.whatsapp.com/";

function openOrRefreshWhatsAppTab() {
  // @ts-ignore
  chrome.tabs.query({ url: WHATSAPP_URL_PATTERN }, function (tabs) {
    if (tabs.length > 0) {
      const tab = tabs.sort(
        (a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0)
      )[0];

      // @ts-ignore
      chrome.tabs.reload(tab.id);
      // @ts-ignore
      chrome.tabs.update(tab.id, { active: true });
      return;
    }

    // @ts-ignore
    chrome.tabs.create({ url: WHATSAPP_URL });
  });
}

// @ts-ignore
chrome.runtime.onInstalled.addListener(function (details) {
  if (details.reason === "update") {
    // @ts-ignore
    chrome.tabs.create({
      url: "https://waxcrm.com/",
    });

    openOrRefreshWhatsAppTab();
  }
});
