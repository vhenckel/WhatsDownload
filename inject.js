/** Script roda no contexto da página; WPPMP é exposto pelo wa.js quando a página carrega */
(() => {
  const BRIDGE_FLAG = "__WHATSDOWNLOAD_PAGE_BRIDGE__";
  const GROUP_IMPORT_REQUEST = "WHATSDOWNLOAD_IMPORT_ACTIVE_GROUP";
  const GROUP_IMPORT_RESPONSE = "WHATSDOWNLOAD_GROUP_IMPORT_RESPONSE";
  const ACTIVE_CHAT_REQUEST = "WHATSDOWNLOAD_GET_ACTIVE_CHAT_ID";
  const ACTIVE_CHAT_RESPONSE = "WHATSDOWNLOAD_ACTIVE_CHAT_ID_RESPONSE";
  const RESPONSE_ORIGIN = window.location.origin;

  const currentScript = document.currentScript;
  const BRIDGE_NONCE = currentScript?.dataset?.wdNonce || null;
  if (currentScript) {
    currentScript.removeAttribute("data-wd-nonce");
  }

  if (window[BRIDGE_FLAG]) return;
  if (!BRIDGE_NONCE) return;
  window[BRIDGE_FLAG] = true;

  function isAuthorizedMessage(event) {
    return (
      !!event.data &&
      event.source === window &&
      event.data.nonce === BRIDGE_NONCE
    );
  }

  function postBridgeMessage(payload) {
    window.postMessage(payload, RESPONSE_ORIGIN);
  }

  function getWPPMP() {
    // @ts-ignore
    return typeof window !== "undefined" ? window.WPPMP : null;
  }

  function serializeWid(value) {
    if (!value) return null;
    if (typeof value === "string") return value;
    if (typeof value._serialized === "string") return value._serialized;
    if (typeof value.id === "string") return value.id;
    if (value.id && typeof value.id._serialized === "string") {
      return value.id._serialized;
    }
    if (typeof value.toString === "function") {
      const serializedValue = String(value);
      if (serializedValue && serializedValue !== "[object Object]") {
        return serializedValue;
      }
    }
    return null;
  }

  function normalizePhone(phone) {
    const digits = String(phone || "").replace(/\D/g, "");
    return digits ? `+${digits}` : "";
  }

  function resolveParticipantName(contactData, participant) {
    const candidateNames = [
      contactData?.formattedName,
      contactData?.pushname,
      contactData?.name,
      contactData?.shortName,
      contactData?.formattedShortName,
      contactData?.notifyName,
      participant?.formattedName,
      participant?.formattedShortName,
    ];

    for (const value of candidateNames) {
      const text = String(value || "").trim();
      if (text) return text;
    }

    return "";
  }

  async function resolveParticipantPhone(participantId) {
    const W = getWPPMP();
    const serializedId = serializeWid(participantId) || "";

    if (!serializedId) return "";

    if (serializedId.includes("@c.us")) {
      const digits = serializedId.split("@")[0].split(":")[0].replace(/\D/g, "");
      return digits ? `+${digits}` : "";
    }

    try {
      if (
        serializedId.includes("@lid") &&
        typeof W?.contact?.getPnLidEntry === "function"
      ) {
        const lidEntry = await W.contact.getPnLidEntry(serializedId);
        const rawPhone =
          lidEntry?.phoneNumber?._serialized ||
          lidEntry?.phoneNumber?.id ||
          lidEntry?.phoneNumber ||
          lidEntry?.pn ||
          lidEntry?.phone ||
          "";
        return normalizePhone(rawPhone);
      }
    } catch (error) {
      console.warn(
        "[WHATSDOWNLOAD] Nao foi possivel resolver telefone do participante:",
        serializedId,
        error
      );
    }

    return "";
  }

  function getActiveChatId() {
    const W = getWPPMP();
    if (!W?.chat?.getActiveChat) {
      return null;
    }

    const activeChat = W.chat.getActiveChat();
    return serializeWid(activeChat?.id);
  }

  async function importActiveGroupFromApi() {
    const W = getWPPMP();

    if (!W?.chat?.getActiveChat || !W?.group?.getParticipants) {
      return {
        success: false,
        reason: "wppmp_not_available",
      };
    }

    const activeChat = W.chat.getActiveChat();
    if (!activeChat) {
      return {
        success: false,
        reason: "no_active_chat",
      };
    }

    if (!activeChat.isGroup) {
      return {
        success: false,
        reason: "not_a_group",
      };
    }

    const groupId = serializeWid(activeChat.id);
    if (!groupId || !groupId.includes("@g.us")) {
      return {
        success: false,
        reason: "no_group_id",
      };
    }

    const groupName = String(
      activeChat.formattedTitle ||
        activeChat.name ||
        activeChat.groupMetadata?.subject ||
        ""
    ).trim();

    if (!groupName) {
      return {
        success: false,
        reason: "no_group_name",
      };
    }

    const participants = await W.group.getParticipants(groupId);
    if (!Array.isArray(participants) || participants.length === 0) {
      return {
        success: false,
        reason: "no_participants",
      };
    }

    const contacts = [];
    const seenPhones = new Set();

    for (const participant of participants) {
      const participantId = participant?.id || participant;
      const serializedParticipantId = serializeWid(participantId);

      if (!serializedParticipantId) {
        continue;
      }

      let contactData = null;
      try {
        if (typeof W?.contact?.get === "function") {
          contactData = await W.contact.get(serializedParticipantId);
        }
      } catch (error) {
        console.warn(
          "[WHATSDOWNLOAD] Nao foi possivel carregar contato do participante:",
          serializedParticipantId,
          error
        );
      }

      const phone = await resolveParticipantPhone(participantId);
      if (!phone || seenPhones.has(phone)) {
        continue;
      }

      seenPhones.add(phone);
      contacts.push({
        phone,
        name: resolveParticipantName(contactData, participant),
      });
    }

    if (!contacts.length) {
      return {
        success: false,
        reason: "no_valid_participants",
      };
    }

    return {
      success: true,
      payload: {
        whatsappGroupId: groupId,
        groupName,
        contacts,
      },
    };
  }

  window.addEventListener(
    "message",
    async (event) => {
      if (!isAuthorizedMessage(event)) {
        return;
      }

      if (event.data.type === ACTIVE_CHAT_REQUEST) {
        try {
          postBridgeMessage({
            type: ACTIVE_CHAT_RESPONSE,
            requestId: event.data.requestId || null,
            chatId: getActiveChatId(),
          });
        } catch (_) {
          postBridgeMessage({
            type: ACTIVE_CHAT_RESPONSE,
            requestId: event.data.requestId || null,
            chatId: null,
          });
        }
        return;
      }

      if (event.data.type !== GROUP_IMPORT_REQUEST) {
        return;
      }

      const requestId = event.data.requestId || null;

      try {
        const result = await importActiveGroupFromApi();
        postBridgeMessage({
          type: GROUP_IMPORT_RESPONSE,
          requestId,
          success: result.success,
          payload: result.payload || null,
          reason: result.reason || null,
        });
      } catch (error) {
        postBridgeMessage({
          type: GROUP_IMPORT_RESPONSE,
          requestId,
          success: false,
          payload: null,
          reason: error?.message || "error",
        });
      }
    },
    false
  );
})();
