const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Open viewer
document.getElementById("openViewer").addEventListener("click", () => {
  const viewerUrl = browserAPI.runtime.getURL("viewer.html");
  browserAPI.tabs.create({ url: viewerUrl });
  window.close();
});
