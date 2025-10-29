const browserAPI = typeof browser !== "undefined" ? browser : chrome;

// Open home page
document.getElementById("openViewer").addEventListener("click", () => {
  const homeUrl = browserAPI.runtime.getURL("home.html");
  browserAPI.tabs.create({ url: homeUrl });
  window.close();
});
