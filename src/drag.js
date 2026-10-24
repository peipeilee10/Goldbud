// 拖曳排序（SPEC 5.6）：按住把手上下拖曳，放開後回呼新的順序。
// 用 Pointer Events，滑鼠和手指都適用；只有把手設定 touch-action: none，其他地方照常捲動。

const EDGE = 80; // 拖到距離畫面邊緣多近時開始自動捲動（px）
const SPEED = 12;

/**
 * list：清單容器；每個子元素要有 data-id。
 * handleSelector：把手的選擇器。
 * onSort(ids)：順序改變後呼叫，ids 是新順序的 data-id 陣列。
 */
export function makeSortable(list, handleSelector, onSort) {
  list.addEventListener("pointerdown", (e) => {
    const handle = e.target.closest(handleSelector);
    if (!handle || !list.contains(handle) || e.button > 0) return;
    const item = handle.closest("[data-id]");
    if (!item) return;
    e.preventDefault();
    drag(list, item, handle, e, onSort);
  });

  // 鍵盤：把手取得焦點時按 ↑ ↓
  list.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    const handle = e.target.closest(handleSelector);
    if (!handle) return;
    const item = handle.closest("[data-id]");
    const sibling = e.key === "ArrowUp" ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling?.dataset.id) return;
    e.preventDefault();
    if (e.key === "ArrowUp") list.insertBefore(item, sibling);
    else list.insertBefore(sibling, item);
    handle.focus();
    onSort(ids(list));
  });
}

function ids(list) {
  return [...list.children].map((el) => el.dataset.id).filter(Boolean);
}

function drag(list, item, handle, down, onSort) {
  const before = ids(list).join();
  let pointerY = down.clientY;
  let originY = down.clientY; // 拖曳中的列「目前所在位置」對應的手指位置
  let scrollTimer = null;

  handle.setPointerCapture(down.pointerId);
  item.classList.add("dragging");
  document.body.classList.add("is-dragging");

  const follow = () => {
    item.style.transform = `translateY(${pointerY - originY}px)`;

    // 和上下相鄰的列比較：越過對方一半就交換位置
    const prev = item.previousElementSibling;
    const next = item.nextElementSibling;
    const rect = item.getBoundingClientRect();
    const mid = rect.top + rect.height / 2;
    if (next?.dataset.id) {
      const r = next.getBoundingClientRect();
      if (mid > r.top + r.height / 2) return swap(() => list.insertBefore(next, item));
    }
    if (prev?.dataset.id) {
      const r = prev.getBoundingClientRect();
      if (mid < r.top + r.height / 2) return swap(() => list.insertBefore(item, prev));
    }
  };

  // 交換後列的原始位置變了，調整基準點，讓它仍然黏在手指下
  const swap = (move) => {
    item.style.transform = "";
    const oldTop = item.getBoundingClientRect().top;
    move();
    originY += item.getBoundingClientRect().top - oldTop;
    follow();
  };

  const autoScroll = () => {
    const h = window.innerHeight;
    const dy = pointerY < EDGE ? -SPEED : pointerY > h - EDGE - 120 ? SPEED : 0;
    if (dy) {
      const y = window.scrollY;
      window.scrollBy(0, dy);
      originY -= window.scrollY - y;
      follow();
    }
    scrollTimer = requestAnimationFrame(autoScroll);
  };
  scrollTimer = requestAnimationFrame(autoScroll);

  const move = (e) => {
    pointerY = e.clientY;
    follow();
  };

  const end = () => {
    cancelAnimationFrame(scrollTimer);
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    item.classList.remove("dragging");
    item.style.transform = "";
    document.body.classList.remove("is-dragging");
    if (ids(list).join() !== before) onSort(ids(list));
  };

  handle.addEventListener("pointermove", move);
  handle.addEventListener("pointerup", end);
  handle.addEventListener("pointercancel", end);
}
