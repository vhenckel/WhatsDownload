// @ts-ignore
const TRIAL_CONTACT_LIMIT = 50;
// @ts-ignore
const db = chrome.storage.local;
const DEFAULT_EXPORT_SETTINGS = {
  format: "csv",
  numberFormat: "format1",
};
const CLEARANCE_COUPON = "WA_09";
const CLEARANCE_END = new Date(2026, 10, 1, 23, 59, 59, 999);

let currentPlanInfo = {
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
let currentGroupData = null;
let hasPromptedTrialRegistration = false;

async function setupExtraction() {
  const [groupData, extPayResponse] = await Promise.all([
    new Promise((resolve) =>
      // @ts-ignore
      chrome.storage.local.get(["contacts", "groupName"], (result) =>
        resolve(result)
      )
    ),
    getPlanInfo(),
  ]);

  currentPlanInfo = extPayResponse?.user || {
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
  updateClearanceBanner();

  if (currentPlanInfo.registrationRequired) {
    promptTrialRegistration();
  }

  const groupNotFoundElement = document.getElementById("groupNotFound");
  const groupFoundElement = document.getElementById("groupFound");
  const contacts = Array.isArray(groupData?.contacts) ? groupData.contacts : [];

  if (groupData?.groupName && contacts.length > 0) {
    currentGroupData = {
      groupName: groupData.groupName,
      contacts,
    };

    // @ts-ignore
    groupNotFoundElement.style.display = "none";
    // @ts-ignore
    groupFoundElement.style.display = "block";

    // @ts-ignore
    document.getElementById("groupName").textContent = groupData.groupName;
    // @ts-ignore
    document.getElementById("numberOfContacts").textContent = contacts.length;

    updatePlanUi();
    loadSavedSelections();
  } else {
    currentGroupData = null;
    // @ts-ignore
    groupNotFoundElement.textContent = currentPlanInfo.registrationRequired
      ? "Complete your trial registration, then open WhatsApp Web and click a group."
      : "Open WhatsApp Web and click a group to load its contacts here.";
    // @ts-ignore
    groupNotFoundElement.style.display = "block";
    // @ts-ignore
    groupFoundElement.style.display = "none";
  }
}

setTimeout(setupExtraction, 1);
// @ts-ignore
chrome.storage.onChanged.addListener(setupExtraction);
// @ts-ignore
document.getElementById("formatSelect").addEventListener("change", saveSelections);
// @ts-ignore
document
  .getElementById("numberFormatSelect")
  .addEventListener("change", saveSelections);

// @ts-ignore
document.getElementById("exportFull").addEventListener("click", handleExportClick);
document
  .getElementById("clearanceCoupon")
  .addEventListener("click", copyClearanceCoupon);
document
  .getElementById("clearanceSubscribe")
  .addEventListener("click", handleClearanceSubscribe);

async function handleExportClick() {
  clearActionFeedback();
  clearPaymentError();

  if (currentPlanInfo.registrationRequired) {
    promptTrialRegistration(true, true);
    return;
  }

  if (currentPlanInfo.paid) {
    exportContacts(null);
    return;
  }

  if (currentPlanInfo.plan === "trial" && currentPlanInfo.trialExportAvailable) {
    const exported = await exportContacts(TRIAL_CONTACT_LIMIT);
    if (exported) {
      const recordResponse = await sendRuntimeMessage({
        action: "recordTrialExport",
      });
      if (!recordResponse?.ok) {
        showPaymentError(
          recordResponse?.error || "Could not finalize trial export."
        );
      }
      await refreshPlanInfo();
      updatePlanUi();
    }
    return;
  }

  const response = await sendRuntimeMessage({ action: "extpayOpenPaymentPage" });
  if (!response?.ok) {
    showPaymentError(response?.error || "Could not open the payment page.");
  }
}

async function getPlanInfo() {
  try {
    const response = await sendRuntimeMessage({ action: "extpayGetUser" });
    return response || null;
  } catch (_) {
    return null;
  }
}

async function refreshPlanInfo() {
  const extPayResponse = await getPlanInfo();
  currentPlanInfo = extPayResponse?.user || currentPlanInfo;
}

function formatTrialTimeRemaining(trialEndsAt) {
  if (!trialEndsAt) return "";

  const remainingMs = new Date(trialEndsAt).getTime() - Date.now();
  if (remainingMs <= 0) return "Trial expired.";

  const hours = Math.floor(remainingMs / (60 * 60 * 1000));
  const minutes = Math.floor((remainingMs % (60 * 60 * 1000)) / (60 * 1000));

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining in trial.`;
  }

  return `${minutes}m remaining in trial.`;
}

function getTrialBlockedHint() {
  if (!currentPlanInfo.trialActive) {
    return "Your 1-day trial has expired. Subscribe to export contacts.";
  }

  return "Your trial export was used. Subscribe to export contacts.";
}

function isClearanceCampaignActive() {
  return Date.now() <= CLEARANCE_END.getTime();
}

function updateClearanceBanner() {
  const banner = document.getElementById("clearanceBanner");
  const visible = isClearanceCampaignActive() && currentPlanInfo.paid !== true;
  banner.hidden = !visible;
}

async function writeClearanceCoupon() {
  try {
    await navigator.clipboard.writeText(CLEARANCE_COUPON);
    return true;
  } catch (_) {
    return false;
  }
}

function showClearanceCopyFeedback(copied) {
  const action = document.getElementById("clearanceCouponAction");
  const hint = document.getElementById("clearanceHint");

  if (!copied) {
    hint.textContent = `Não foi possível copiar. Use o cupom ${CLEARANCE_COUPON}.`;
    return;
  }

  action.textContent = "Copiado";
  hint.textContent =
    "Cupom WA_09 copiado. No Stripe, clique em Adicionar código promocional e cole.";
  window.setTimeout(() => {
    action.textContent = "Copiar";
  }, 2000);
}

async function copyClearanceCoupon() {
  const copied = await writeClearanceCoupon();
  showClearanceCopyFeedback(copied);
}

async function handleClearanceSubscribe() {
  const copied = await writeClearanceCoupon();
  showClearanceCopyFeedback(copied);

  const response = await sendRuntimeMessage({ action: "extpayOpenPaymentPage" });
  if (!response?.ok) {
    document.getElementById("clearanceHint").textContent =
      response?.error || "Não foi possível abrir a página de contratação.";
  }
}

function updatePlanUi() {
  updateClearanceBanner();
  const planCard = document.getElementById("planCard");
  const planStatusElement = document.getElementById("planStatus");
  const exportHintElement = document.getElementById("exportHint");
  const exportButton = document.getElementById("exportFull");
  const actionsElement = document.getElementById("actions");

  clearActionFeedback();
  clearPaymentError();

  // @ts-ignore
  planCard.style.display = "block";
  // @ts-ignore
  actionsElement.classList.add("single-action");

  if (currentPlanInfo.registrationRequired) {
    // @ts-ignore
    planStatusElement.textContent = "Trial registration required";
    // @ts-ignore
    exportHintElement.textContent =
      `Start your 1-day trial: one export of up to ${TRIAL_CONTACT_LIMIT} contacts.`;
    // @ts-ignore
    exportButton.textContent = "Start Trial";
    return;
  }

  if (currentPlanInfo.paid) {
    // @ts-ignore
    planCard.style.display = "none";
    // @ts-ignore
    exportButton.textContent = "Export";
    return;
  }

  if (currentPlanInfo.plan === "trial" && currentPlanInfo.trialExportAvailable) {
    const exportCount = Math.min(
      currentGroupData?.contacts?.length || 0,
      TRIAL_CONTACT_LIMIT
    );
    // @ts-ignore
    planStatusElement.textContent = "Trial active";
    // @ts-ignore
    exportHintElement.textContent = `One export of up to ${TRIAL_CONTACT_LIMIT} contacts. ${formatTrialTimeRemaining(currentPlanInfo.trialEndsAt)}`;
    // @ts-ignore
    exportButton.textContent = `Export Trial (${exportCount})`;
    return;
  }

  // @ts-ignore
  planStatusElement.textContent = "Trial ended";
  // @ts-ignore
  exportHintElement.textContent = getTrialBlockedHint();
  // @ts-ignore
  exportButton.textContent = "Subscribe";
}

async function exportContacts(limit) {
  if (!currentPlanInfo.canExport && !currentPlanInfo.paid) {
    showActionFeedback("Export is not available on your current plan.", "error");
    return false;
  }

  // @ts-ignore
  const format = document.getElementById("formatSelect").value;
  // @ts-ignore
  const numberFormat = document.getElementById("numberFormatSelect").value;

  db.set({
    format,
    numberFormat,
  });

  setExportButtonDisabled(true);
  showActionFeedback("Exporting file...", "loading");
  clearPaymentError();

  let mimeType = "text/plain";
  if (format === "csv") {
    mimeType = "text/csv";
  } else if (format === "xls") {
    mimeType = "application/vnd.ms-excel";
  }

  if (!currentGroupData?.contacts?.length || !currentGroupData?.groupName) {
    setExportButtonDisabled(false);
    showActionFeedback("No group data available to export.", "error");
    return false;
  }

  const exportContactsList =
    typeof limit === "number"
      ? currentGroupData.contacts.slice(0, limit)
      : currentGroupData.contacts;
  let documentCSV = `First Name; Phone
  `;
  const cleanContacts = handleContacts(exportContactsList, numberFormat);

  for (const item of cleanContacts) {
    documentCSV += `${item.name}; ${item.phone}
  `;
  }

  const filename = `${sanitizeFilename(currentGroupData.groupName)}.${format}`;
  const blob = new Blob([documentCSV], {
    type: `${mimeType};charset=utf-8`,
  });
  const objectUrl = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");

  downloadLink.href = objectUrl;
  downloadLink.download = filename;
  downloadLink.style.display = "none";

  document.body.appendChild(downloadLink);

  try {
    downloadLink.click();
    showActionFeedback(
      "File generated. Check your Downloads folder.",
      "success"
    );
    return true;
  } catch (error) {
    showActionFeedback(
      error?.message || "Could not start the download.",
      "error"
    );
    return false;
  } finally {
    setExportButtonDisabled(false);
    window.setTimeout(() => {
      URL.revokeObjectURL(objectUrl);
      downloadLink.remove();
    }, 1000);
  }
}

function handleContacts(contacts, format) {
  return contacts.map((item, index) => ({
    name: getContactName(item, index),
    phone: formatPhoneByPreset(String(item?.phone || ""), format),
  }));
}

function getContactName(contact, index) {
  const name = String(contact?.name || "").trim();
  if (name) {
    return name.replace(/;/g, ",");
  }

  return `Contact ${index + 1}`;
}

function sanitizeFilename(name) {
  return String(name || "contacts")
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ");
}

function formatPhoneByPreset(phone, format) {
  const digits = String(phone || "").replace(/[^\d]+/g, "");
  if (!digits) {
    return "";
  }

  const { countryCode, areaCode, subscriber } = splitPhoneParts(digits);
  const subscriberFormatted = formatSubscriber(subscriber);
  const compactLocalNumber = `${areaCode}${subscriber}`;
  const compactInternationalNumber = `${countryCode}${compactLocalNumber}`;

  if (format === "format2") {
    return compactInternationalNumber ? `+${compactInternationalNumber}` : `+${digits}`;
  }

  if (format === "format4") {
    return compactLocalNumber || digits;
  }

  if (format === "format3") {
    if (!areaCode) {
      return subscriberFormatted;
    }
    return `${areaCode} ${subscriberFormatted}`.trim();
  }

  if (!countryCode && !areaCode) {
    return `+${digits}`;
  }

  const countryPrefix = countryCode ? `+${countryCode}` : "+";
  if (!areaCode) {
    return `${countryPrefix} ${subscriberFormatted}`.trim();
  }

  return `${countryPrefix} ${areaCode} ${subscriberFormatted}`.trim();
}

function splitPhoneParts(digits) {
  const normalizedDigits = String(digits || "").replace(/[^\d]+/g, "");

  if (normalizedDigits.length < 8) {
    return {
      countryCode: "",
      areaCode: "",
      subscriber: normalizedDigits,
    };
  }

  const canUseNineDigitSubscriber =
    normalizedDigits.length - 9 >= 3 &&
    normalizedDigits.slice(-9, -8) === "9";
  const canUseEightDigitSubscriber = normalizedDigits.length - 8 >= 3;

  let subscriberLength = 8;
  if (canUseNineDigitSubscriber) {
    subscriberLength = 9;
  } else if (!canUseEightDigitSubscriber && normalizedDigits.length > 8) {
    subscriberLength = normalizedDigits.length - 2;
  }

  const subscriber = normalizedDigits.slice(-subscriberLength);
  const remaining = normalizedDigits.slice(0, -subscriberLength);

  let areaCode = "";
  let countryCode = remaining;

  if (remaining.length >= 2) {
    areaCode = remaining.slice(-2);
    countryCode = remaining.slice(0, -2);
  }

  return {
    countryCode,
    areaCode,
    subscriber,
  };
}

function formatSubscriber(subscriber) {
  const digits = String(subscriber || "").replace(/[^\d]+/g, "");
  if (digits.length <= 4) {
    return digits;
  }

  return `${digits.slice(0, -4)}-${digits.slice(-4)}`;
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    // @ts-ignore
    chrome.runtime.sendMessage(message, (response) => {
      // @ts-ignore
      if (chrome.runtime.lastError) {
        resolve({
          ok: false,
          // @ts-ignore
          error: chrome.runtime.lastError.message,
        });
        return;
      }

      resolve(response);
    });
  });
}

function loadSavedSelections() {
  db.get(DEFAULT_EXPORT_SETTINGS, (items) => {
    // @ts-ignore
    document.getElementById("formatSelect").value = items.format;
    // @ts-ignore
    document.getElementById("numberFormatSelect").value = items.numberFormat;
  });
}

function saveSelections() {
  db.set({
    // @ts-ignore
    format: document.getElementById("formatSelect").value,
    // @ts-ignore
    numberFormat: document.getElementById("numberFormatSelect").value,
  });
}

function showPaymentError(message) {
  // @ts-ignore
  document.getElementById("paymentError").textContent = message;
}

async function promptTrialRegistration(showMessage, forceOpen) {
  if (hasPromptedTrialRegistration && !forceOpen) {
    if (showMessage) {
      showActionFeedback(
        "Complete your trial registration to continue.",
        "loading"
      );
    }
    return;
  }

  hasPromptedTrialRegistration = true;

  if (showMessage) {
    showActionFeedback(
      "Complete your trial registration to continue.",
      "loading"
    );
  }

  const response = await sendRuntimeMessage({ action: "extpayOpenTrialPage" });
  if (!response?.ok) {
    hasPromptedTrialRegistration = false;
    showPaymentError(
      response?.error || "Could not open the trial registration page."
    );
  }
}

function clearPaymentError() {
  // @ts-ignore
  document.getElementById("paymentError").textContent = "";
}

function showActionFeedback(message, type) {
  const feedbackElement = document.getElementById("actionFeedback");
  // @ts-ignore
  feedbackElement.textContent = message;
  // @ts-ignore
  feedbackElement.className = "action-feedback";

  if (type) {
    // @ts-ignore
    feedbackElement.classList.add(`is-${type}`);
  }
}

function clearActionFeedback() {
  const feedbackElement = document.getElementById("actionFeedback");
  // @ts-ignore
  feedbackElement.textContent = "";
  // @ts-ignore
  feedbackElement.className = "action-feedback";
}

function setExportButtonDisabled(disabled) {
  // @ts-ignore
  document.getElementById("exportFull").disabled = disabled;
}
