/* global chrome */
(() => {
  const CONTENT_FLAG = "data-whatsdownload-content-loaded";
  const BRIDGE_NONCE_KEY = "__WHATSDOWNLOAD_BRIDGE_NONCE__";
  const GROUP_IMPORT_REQUEST = "WHATSDOWNLOAD_IMPORT_ACTIVE_GROUP";
  const GROUP_IMPORT_RESPONSE = "WHATSDOWNLOAD_GROUP_IMPORT_RESPONSE";
  const ACTIVE_CHAT_REQUEST = "WHATSDOWNLOAD_GET_ACTIVE_CHAT_ID";
  const ACTIVE_CHAT_RESPONSE = "WHATSDOWNLOAD_ACTIVE_CHAT_ID_RESPONSE";
  const ACTIVE_CHAT_POLL_MS = 1200;
  const ACTIVE_CHAT_TIMEOUT_MS = 1500;
  const GROUP_IMPORT_INTERVAL_MS = 600;
  const GROUP_IMPORT_TIMEOUT_MS = 2500;
  const GROUP_IMPORT_MAX_ATTEMPTS = 20;
  const MESSAGE_ORIGIN = window.location.origin;

  if (document.documentElement.hasAttribute(CONTENT_FLAG)) {
    return;
  }

  document.documentElement.setAttribute(CONTENT_FLAG, "true");

  let groupImportInFlight = false;
  let activeChatRequestInFlight = false;
  let currentRequestId = 0;
  let activeGroupImportInterval = null;
  let activeImportTargetChatId = null;
  let lastObservedChatId = null;
  let lastPersistedGroupId = null;

  function getBridgeNonce() {
    if (!window[BRIDGE_NONCE_KEY]) {
      window[BRIDGE_NONCE_KEY] =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    return window[BRIDGE_NONCE_KEY];
  }

  // Garante o nonce antes do wppLoader injetar o bridge na página
  getBridgeNonce();

  function isExtensionValid() {
    try {
      // @ts-ignore
      return typeof chrome !== "undefined" && !!chrome.runtime?.id;
    } catch (_) {
      return false;
    }
  }

  function setStorage(items) {
    if (!isExtensionValid()) return;
    try {
      // @ts-ignore
      chrome.storage.local.set(items);
    } catch (_) {}
  }

  function clearPersistedGroup() {
    lastPersistedGroupId = null;
    setStorage({
      contacts: null,
      groupName: null,
      whatsappGroupId: null,
    });
  }

  function sanitizeGroupImportPayload(payload) {
    if (
      !payload ||
      !payload.whatsappGroupId ||
      !payload.groupName ||
      !Array.isArray(payload.contacts)
    ) {
      return null;
    }

    const seenPhones = new Set();
    const contacts = payload.contacts
      .map((contact) => {
        const digits = String(contact?.phone || "").replace(/\D/g, "");
        if (!digits) return null;

        const phone = `+${digits}`;
        if (seenPhones.has(phone)) return null;
        seenPhones.add(phone);

        return {
          phone,
          name: String(contact?.name || "").trim(),
        };
      })
      .filter(Boolean);

    if (!contacts.length) {
      return null;
    }

    return {
      whatsappGroupId: String(payload.whatsappGroupId),
      groupName: String(payload.groupName).trim() || "Grupo sem nome",
      contacts,
    };
  }

  function persistGroup(payload) {
    const sanitizedPayload = sanitizeGroupImportPayload(payload);
    if (!sanitizedPayload) return;

    lastPersistedGroupId = sanitizedPayload.whatsappGroupId;
    setStorage({
      contacts: sanitizedPayload.contacts,
      groupName: sanitizedPayload.groupName,
      whatsappGroupId: sanitizedPayload.whatsappGroupId,
    });
  }

  function requestActiveChatId(onSuccess) {
    activeChatRequestInFlight = true;
    currentRequestId += 1;
    let finished = false;

    const cleanup = () => {
      finished = true;
      activeChatRequestInFlight = false;
      window.removeEventListener("message", messageHandler);
      clearTimeout(timeoutId);
    };

    const messageHandler = (event) => {
      if (!event.data || event.data.type !== ACTIVE_CHAT_RESPONSE || finished) {
        return;
      }

      cleanup();
      onSuccess(event.data.chatId || null);
    };

    window.addEventListener("message", messageHandler);
    window.postMessage(
      {
        type: ACTIVE_CHAT_REQUEST,
        requestId: currentRequestId,
        nonce: getBridgeNonce(),
      },
      MESSAGE_ORIGIN
    );

    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      cleanup();
    }, ACTIVE_CHAT_TIMEOUT_MS);
  }

  function requestActiveGroupImport(targetChatId, interval, attempt) {
    groupImportInFlight = true;
    currentRequestId += 1;
    const requestId = currentRequestId;
    let finished = false;

    const cleanup = () => {
      finished = true;
      groupImportInFlight = false;
      window.removeEventListener("message", messageHandler);
      clearTimeout(timeoutId);
    };

    const messageHandler = (event) => {
      if (
        !event.data ||
        event.data.type !== GROUP_IMPORT_RESPONSE ||
        event.data.requestId !== requestId ||
        finished
      ) {
        return;
      }

      cleanup();

      if (!event.data.success || !event.data.payload) {
        return;
      }

      const payload = sanitizeGroupImportPayload(event.data.payload);
      if (!payload || payload.whatsappGroupId !== targetChatId) {
        return;
      }

      clearInterval(interval);
      activeGroupImportInterval = null;
      activeImportTargetChatId = null;
      persistGroup(payload);
    };

    window.addEventListener("message", messageHandler);
    window.postMessage(
      {
        type: GROUP_IMPORT_REQUEST,
        requestId,
        nonce: getBridgeNonce(),
      },
      MESSAGE_ORIGIN
    );

    const timeoutId = window.setTimeout(() => {
      if (finished) return;
      cleanup();

      if (attempt >= GROUP_IMPORT_MAX_ATTEMPTS && activeGroupImportInterval) {
        clearInterval(activeGroupImportInterval);
        activeGroupImportInterval = null;
        activeImportTargetChatId = null;
      }
    }, GROUP_IMPORT_TIMEOUT_MS);
  }

  function startImportForChat(targetChatId) {
    if (activeGroupImportInterval) {
      clearInterval(activeGroupImportInterval);
    }

    activeImportTargetChatId = targetChatId;
    let count = 0;
    activeGroupImportInterval = window.setInterval(() => {
      count += 1;

      if (!groupImportInFlight) {
        requestActiveGroupImport(targetChatId, activeGroupImportInterval, count);
      }

      if (count >= GROUP_IMPORT_MAX_ATTEMPTS && activeGroupImportInterval) {
        clearInterval(activeGroupImportInterval);
        activeGroupImportInterval = null;
        activeImportTargetChatId = null;
      }
    }, GROUP_IMPORT_INTERVAL_MS);
  }

  function pollActiveChatForImport() {
    if (groupImportInFlight || activeChatRequestInFlight) {
      return;
    }

    requestActiveChatId((chatId) => {
      const normalizedChatId = String(chatId || "");

      if (!normalizedChatId) {
        lastObservedChatId = null;
        activeImportTargetChatId = null;
        if (activeGroupImportInterval) {
          clearInterval(activeGroupImportInterval);
          activeGroupImportInterval = null;
        }
        clearPersistedGroup();
        return;
      }

      const chatChanged = normalizedChatId !== lastObservedChatId;

      lastObservedChatId = normalizedChatId;

      if (!normalizedChatId.endsWith("@g.us")) {
        activeImportTargetChatId = null;
        if (activeGroupImportInterval) {
          clearInterval(activeGroupImportInterval);
          activeGroupImportInterval = null;
        }
        clearPersistedGroup();
        return;
      }

      if (
        activeImportTargetChatId &&
        activeImportTargetChatId !== normalizedChatId &&
        activeGroupImportInterval
      ) {
        clearInterval(activeGroupImportInterval);
        activeGroupImportInterval = null;
        activeImportTargetChatId = null;
      }

      if (
        chatChanged ||
        normalizedChatId !== lastPersistedGroupId
      ) {
        if (activeImportTargetChatId !== normalizedChatId) {
          startImportForChat(normalizedChatId);
        }
      }
    });
  }

  if (isExtensionValid()) {
    // @ts-ignore
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes.whatsappGroupId) {
        return;
      }

      lastPersistedGroupId = changes.whatsappGroupId.newValue || null;
    });
  }

  window.setTimeout(() => {
    pollActiveChatForImport();
    window.setInterval(pollActiveChatForImport, ACTIVE_CHAT_POLL_MS);
  }, 1000);
})();
