document.getElementById("openViewer").addEventListener("click", () => {
  const viewerUrl = chrome.runtime.getURL("viewer.html");
  chrome.tabs.create({ url: viewerUrl });
  window.close();
});
