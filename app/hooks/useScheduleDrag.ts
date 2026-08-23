"use client";

import { type PointerEvent as ReactPointerEvent, useRef, useState } from "react";
import type { Place } from "../domain/types";

export function useScheduleDrag({
  places,
  setPlaces,
}: {
  places: Place[];
  setPlaces: (update: Place[] | ((items: Place[]) => Place[])) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const draggedIndex = useRef<number | null>(null);

  function movePlace(from: number, to: number) {
    if (to < 0 || to >= places.length || from === to) return;
    setPlaces((items) => {
      const next = [...items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }

  function beginDrag(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    draggedIndex.current = index;
    setDragIndex(index);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (draggedIndex.current === null) return;
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>("[data-order-index]");
    if (!target) return;
    const to = Number(target.dataset.orderIndex);
    const from = draggedIndex.current;
    if (!Number.isInteger(to) || from === to) return;
    movePlace(from, to);
    draggedIndex.current = to;
    setDragIndex(to);
  }

  function endDrag() {
    draggedIndex.current = null;
    setDragIndex(null);
  }

  return { dragIndex, beginDrag, continueDrag, endDrag };
}
