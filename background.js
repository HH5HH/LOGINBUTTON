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
