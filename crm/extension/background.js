import { BASE } from "./config.js";

// The toolbar button opens the side panel.
chrome.runtime.onInstalled.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));
chrome.runtime.onStartup?.addListener(() => chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {}));

// Lodgely's "Allow" page hands over the sign-in. Only accepted from Lodgely itself.
chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  const origin = sender.url ? new URL(sender.url).origin : "";
  const trusted = origin === new URL(BASE).origin || /^http:\/\/localhost(:\d+)?$/.test(origin);
  if (!trusted || msg?.type !== "lodgely:paired" || typeof msg.token !== "string" || !msg.token.startsWith("lxt_")) {
    reply({ ok: false });
    return;
  }
  chrome.storage.local.set({ token: msg.token, base: origin, user: msg.user ?? null }).then(() => {
    chrome.runtime.sendMessage({ type: "lodgely:signed-in" }).catch(() => {});
    reply({ ok: true });
  });
  return true;
});
