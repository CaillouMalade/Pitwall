// Applies the saved appearance before first paint to avoid a theme flash.
(function () {
  var saved;
  try {
    saved = localStorage.getItem("pitwall-theme");
  } catch (error) {
    // Appearance still follows the system when storage is blocked.
  }
  var dark =
    saved === "dark" ||
    (saved !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document
    .querySelector('meta[name="theme-color"]')
    .setAttribute("content", dark ? "#111111" : "#f7f7f5");
})();
