// Background Service Worker for AI Roundtable

// Ensure Side Panel opens when the extension icon is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

chrome.runtime.onInstalled.addListener(() => {
    console.log('AI Roundtable Extension Installed');
});
