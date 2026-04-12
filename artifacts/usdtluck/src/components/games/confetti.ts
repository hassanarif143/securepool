/** DOM confetti (no extra deps). Uses `sp-confetti-fall` from global CSS. */
export function fireConfetti(isBig: boolean) {
  const container = document.createElement("div");
  container.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
  document.body.appendChild(container);

  const colors = isBig
    ? ["#FFD700", "#FFA500", "#FF6347", "#00E5CC", "#8B5CF6"]
    : ["#00E5CC", "#00B89C", "#8B5CF6"];
  const count = isBig ? 60 : 30;

  for (let i = 0; i < count; i++) {
    const piece = document.createElement("div");
    piece.style.cssText = `
      position:absolute; top:-10px;
      left:${Math.random() * 100}%;
      width:${4 + Math.random() * 6}px;
      height:${4 + Math.random() * 6}px;
      background:${colors[Math.floor(Math.random() * colors.length)]};
      border-radius:${Math.random() > 0.5 ? "50%" : "2px"};
      animation: sp-confetti-fall ${2 + Math.random() * 1.5}s linear ${Math.random() * 0.8}s forwards;
    `;
    container.appendChild(piece);
  }
  window.setTimeout(() => container.remove(), 4000);
}
