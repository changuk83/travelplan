"use client";

import { type PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import type { Place } from "../domain/types";

export function useScheduleDrag({
  places,
  setPlaces,
}: {
  places: Place[];
  setPlaces: (update: Place[] | ((items: Place[]) => Place[])) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const session = useRef<{
    pointerId: number;
    y: number;
    startY: number;
    moved: boolean;
    stop: (commit: boolean) => void;
  } | null>(null);
  useEffect(() => () => session.current?.stop(false), [places]);

  function beginDrag(index: number, event: ReactPointerEvent<HTMLButtonElement>) {
    if (!event.isPrimary || event.button !== 0 || session.current) return;
    const handle = event.currentTarget;
    const row = handle.closest<HTMLElement>("[data-order-index]");
    const list = row?.closest<HTMLElement>(".sortable");
    if (!row || !list) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = row.getBoundingClientRect();
    const offset = event.clientY - rect.top;
    const ghost = row.cloneNode(true) as HTMLElement;
    ghost.removeAttribute("data-order-index");
    ghost.removeAttribute("data-place-id");
    ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
    ghost.classList.add("schedule-drag-ghost");
    ghost.setAttribute("aria-hidden", "true");
    ghost.inert = true;
    const layer = document.createElement("div");
    layer.className = "calm-timeline schedule-drag-layer";
    layer.style.cssText = `position:fixed;left:${rect.left}px;top:0;width:${rect.width}px;padding:0;margin:0;z-index:1000;pointer-events:none;`;
    layer.appendChild(ghost);
    document.body.appendChild(layer);
    const sourceTracks = row.querySelectorAll<HTMLElement>(".candidate-track");
    ghost.querySelectorAll<HTMLElement>(".candidate-track").forEach((track, i) => {
      track.scrollLeft = sourceTracks[i]?.scrollLeft ?? 0;
    });
    const rows = Array.from(list.querySelectorAll<HTMLElement>("[data-order-index]"));
    let scroll: HTMLElement | null = row.parentElement;
    while (
      scroll &&
      !(/(auto|scroll)/.test(getComputedStyle(scroll).overflowY) && scroll.scrollHeight > scroll.clientHeight)
    )
      scroll = scroll.parentElement;
    let frame = 0,
      target = index;
    const ids = places.map((place) => place.id).join("|");
    const clear = () => rows.forEach((item) => item.classList.remove("schedule-drop-before", "schedule-drop-after"));
    const cancel = () => session.current?.stop(false);
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    };
    const state = {
      pointerId: event.pointerId,
      y: event.clientY,
      startY: event.clientY,
      moved: false,
      stop: (commit: boolean) => {
        if (session.current !== state) return;
        if (commit && state.moved) {
          target = rows
            .filter((item) => item !== row)
            .filter((item) => {
              const bounds = item.getBoundingClientRect();
              return state.y > bounds.top + bounds.height / 2;
            }).length;
        }
        session.current = null;
        cancelAnimationFrame(frame);
        layer.remove();
        clear();
        document.removeEventListener("keydown", escape, true);
        window.removeEventListener("blur", cancel);
        if (handle.hasPointerCapture(state.pointerId)) handle.releasePointerCapture(state.pointerId);
        setDragIndex(null);
        if (commit && state.moved && target !== index)
          setPlaces((items) => {
            if (items.map((place) => place.id).join("|") !== ids) return items;
            const next = [...items];
            const [moved] = next.splice(index, 1);
            next.splice(target, 0, moved);
            return next;
          });
      },
    };
    session.current = state;
    handle.setPointerCapture(event.pointerId);
    setDragIndex(index);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("blur", cancel);
    const tick = () => {
      if (session.current !== state) return;
      if (state.moved) {
        const bounds = scroll?.getBoundingClientRect();
        const top = Math.max(0, bounds?.top ?? 0),
          bottom = Math.min(window.innerHeight, bounds?.bottom ?? window.innerHeight);
        const speed =
          state.y < top + 48
            ? -Math.min(10, (top + 48 - state.y) / 5)
            : state.y > bottom - 48
              ? Math.min(10, (state.y - bottom + 48) / 5)
              : 0;
        if (speed) {
          if (scroll) scroll.scrollTop += speed;
          else window.scrollBy(0, speed);
        }
        const others = rows.filter((item) => item !== row);
        target = others.filter((item) => {
          const r = item.getBoundingClientRect();
          return state.y > r.top + r.height / 2;
        }).length;
        clear();
        if (target !== index) {
          if (others[target]) others[target].classList.add("schedule-drop-before");
          else others.at(-1)?.classList.add("schedule-drop-after");
        }
      }
      layer.style.transform = `translateY(${state.y - offset}px)`;
      frame = requestAnimationFrame(tick);
    };
    tick();
  }

  function continueDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const state = session.current;
    if (!state || event.pointerId !== state.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    state.y = event.clientY;
    if (Math.abs(state.y - state.startY) > 5) state.moved = true;
  }

  function endDrag(event?: ReactPointerEvent<HTMLButtonElement>) {
    if (event && event.pointerId !== session.current?.pointerId) return;
    session.current?.stop(event?.type === "pointerup");
  }

  return { dragIndex, beginDrag, continueDrag, endDrag };
}
