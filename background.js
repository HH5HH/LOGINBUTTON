import {
  clearLoginButtonVault,
  deleteProgrammerVaultRecord,
  exportLoginButtonVaultSnapshot,
  getLoginButtonVaultStats,
  importLoginButtonVaultSnapshot,
  readProgrammerVaultRecord
} from "./vault.js";

async function syncSidePanelBehavior() {
  if (!chrome.sidePanel?.setPanelBehavior) {
    return;
  }

  try {
    await chrome.sidePanel.setPanelBehavior({
      openPanelOnActionClick: true
    });
  } catch {
    // Ignore unsupported environments.
  }
}

void syncSidePanelBehavior();

chrome.runtime.onInstalled.addListener(() => {
  void syncSidePanelBehavior();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message?.type !== "loginbutton:vault") {
    return undefined;
  }

  void (async () => {
    try {
      const result = await handleVaultMessage(message);
      sendResponse({
        ok: true,
        result
      });
    } catch (error) {
      sendResponse({
        ok: false,
        error: serializeBackgroundError(error),
        senderUrl: String(sender?.url || "").trim()
      });
    }
  })();

  return true;
});

async function handleVaultMessage(message = {}) {
  const action = String(message?.action || "").trim();
  switch (action) {
    case "stats":
      return getLoginButtonVaultStats();
    case "export":
      return exportLoginButtonVaultSnapshot();
    case "import":
      return importLoginButtonVaultSnapshot(message?.payload || null, {
        replaceExisting: message?.replaceExisting === true
      });
    case "clear":
      return clearLoginButtonVault();
    case "get-programmer-record":
      return readProgrammerVaultRecord({
        environmentId: message?.environmentId,
        programmerId: message?.programmerId
      });
    case "delete-programmer-record":
      return deleteProgrammerVaultRecord({
        environmentId: message?.environmentId,
        programmerId: message?.programmerId
      });
    default:
      throw new Error(`Unsupported LoginButton VAULT action: ${action || "unknown"}`);
  }
}

function serializeBackgroundError(error) {
  if (error instanceof Error) {
    return error.message || "Unknown error";
  }

  return String(error || "Unknown error");
}
