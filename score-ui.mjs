// A one-screen summary; the complete ledger is available in a separate scroll area.
export function renderDriveResult(
  root,
  { summary, courseName, parkingName, carName, distanceLabel, elapsed, onNext },
) {
  const el = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text != null) node.textContent = text;
    if (className) node.className = className;
    return node;
  };
  root.replaceChildren();
  root.hidden = false;
  root.dataset.details = "false";
  const header = el("div", null, "result-top"),
    intro = el("div", null, "result-intro");
  intro.append(
    el("small", "드라이브 완료", "result-kicker"),
    el("h1", "주차 완료!"),
    el("p", courseName || parkingName, "result-course"),
    el(
      "p",
      `${carName} · ${distanceLabel} · ${Math.floor(elapsed / 60)}분 ${Math.floor(elapsed % 60)}초`,
      "result-meta",
    ),
  );
  const totals = el("div", null, "result-totals"),
    score = el("div", String(summary.score), "final-score");
  score.dataset.value = summary.score;
  score.append(el("span", "점"));
  score.classList.toggle("is-negative", summary.score < 0);
  const ledger = el("div", null, "score-ledger");
  ledger.setAttribute("aria-label", "점수 합계");
  ledger.append(
    el("span", `획득 +${summary.earned}`, "earned"),
    el("span", `감점 −${summary.deducted}`, "deducted"),
  );
  totals.append(score, ledger);
  header.append(intro, totals);
  const panels = el("div", null, "result-feedback compact-feedback"),
    details = el("div", null, "result-details");
  details.id = "result-full-records";
  details.hidden = true;
  details.tabIndex = 0;
  for (const [kind, heading, items] of [
    ["strengths", "잘한 점", summary.strengths],
    ["improvements", "개선할 점", summary.improvements],
  ]) {
    for (const compact of [true, false]) {
      const section = el("section", null, kind);
      section.append(el("h2", heading));
      const ordered = compact
        ? [...items]
            .sort(
              (a, b) =>
                (b.penalty || b.points || 0) - (a.penalty || a.points || 0),
            )
            .slice(0, 2)
        : items;
      if (!ordered.length)
        section.append(
          el(
            "p",
            kind === "strengths"
              ? "안전운전 기록을 쌓아 보세요."
              : "기록된 위반이 없습니다.",
            "feedback-empty",
          ),
        );
      else {
        const list = el("ul");
        for (const item of ordered) {
          const li = el("li"),
            row = el("div", null, "feedback-title");
          row.append(
            el("strong", item.title),
            el(
              "span",
              `${item.count}회 · ${kind === "strengths" ? "+" + item.points : item.penalty ? "−" + item.penalty : "안내"}${kind === "strengths" || item.penalty ? "점" : ""}`,
            ),
          );
          li.append(row);
          if (!compact) li.append(el("p", item.detail));
          list.append(li);
        }
        section.append(list);
      }
      (compact ? panels : details).append(section);
    }
  }
  const priority = [...summary.improvements].sort(
    (a, b) => (b.penalty || 0) - (a.penalty || 0),
  )[0];
  const tip = el(
    "p",
    priority?.detail || "다음에는 다른 코스나 교통량으로 도전해 보세요.",
    "result-tip",
  );
  const actions = el("div", null, "result-actions"),
    expand = el("button", "상세 기록", "result-expand"),
    next = el("button", "다음 드라이브 →", "primary");
  expand.setAttribute("aria-expanded", "false");
  expand.setAttribute("aria-controls", details.id);
  expand.onclick = () => {
    const open = details.hidden;
    details.hidden = !open;
    panels.hidden = open;
    tip.hidden = open;
    root.dataset.details = String(open);
    expand.textContent = open ? "요약 보기" : "상세 기록";
    expand.setAttribute("aria-expanded", String(open));
  };
  next.onclick = onNext;
  actions.append(expand, next);
  root.append(header, panels, tip, details, actions);
  root.setAttribute("tabindex", "-1");
  root.scrollTop = 0;
  root.focus({ preventScroll: true });
}
