// Browser API polyfill for cross-browser compatibility
const browserAPI = typeof browser !== "undefined" ? browser : chrome;

document.getElementById("openViewer").addEventListener("click", () => {
  const viewerUrl = browserAPI.runtime.getURL("viewer.html");
  browserAPI.tabs.create({ url: viewerUrl });
  window.close();
});
