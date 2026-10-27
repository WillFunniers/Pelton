(function () {
  function isMac() {
    var platform =
      (navigator.userAgentData && navigator.userAgentData.platform) ||
      navigator.platform ||
      "";
    return /mac/i.test(platform);
  }

  document.documentElement.classList.add(isMac() ? "os-mac" : "os-other");
})();
