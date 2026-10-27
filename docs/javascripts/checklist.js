(function () {
  function storageKey(text) {
    return "pelton-docs-checklist:" + location.pathname + ":" + text.trim();
  }

  function wireUp(box) {
    var li = box.closest(".task-list-item");
    if (!li) return;
    var text = li.textContent || "";

    box.disabled = false;

    try {
      var saved = localStorage.getItem(storageKey(text));
      if (saved !== null) box.checked = saved === "1";
    } catch (e) {
      // localStorage unavailable (private mode, blocked storage): the
      // checkbox still works for the current page view, just isn't saved.
    }

    box.addEventListener("change", function () {
      try {
        localStorage.setItem(storageKey(text), box.checked ? "1" : "0");
      } catch (e) {
        // ignore, see above
      }
    });
  }

  document
    .querySelectorAll(".checklist input[type='checkbox']")
    .forEach(wireUp);
})();
