(() => {
  const copyButtons = document.querySelectorAll("[data-copy]");

  for (const button of copyButtons) {
    button.addEventListener("click", async () => {
      const text = button.getAttribute("data-copy") || "";
      try {
        await navigator.clipboard.writeText(text.replace(/\\n/g, "\n"));
        const old = button.textContent;
        button.textContent = "Copied";
        setTimeout(() => {
          button.textContent = old;
        }, 900);
      } catch (error) {
        button.textContent = "Copy failed";
      }
    });
  }
})();