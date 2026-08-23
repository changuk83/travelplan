"use client";

import { type TouchEvent as ReactTouchEvent, useRef, useState } from "react";
import type { DayPlan } from "../domain/types";

export function useDaySwipe({
  days,
  activeDayId,
  onSelectDay,
}: {
  days: DayPlan[];
  activeDayId: string;
  onSelectDay: (id: string) => void;
}) {
  const gesture = useRef<{ x: number; y: number; time: number } | null>(null);
  const [offset, setOffset] = useState(0);
  const [animating, setAnimating] = useState(false);

  function begin(event: ReactTouchEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    if (target.closest("button,a,input,textarea,select,.candidate-carousel,.day-switcher,.plan-map,.drag-handle")) {
      gesture.current = null;
      return;
    }
    const touch = event.touches[0];
    gesture.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    setAnimating(false);
  }

  function move(event: ReactTouchEvent<HTMLElement>) {
    const start = gesture.current;
    if (!start) return;
    const touch = event.touches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) {
      gesture.current = null;
      setOffset(0);
      return;
    }
    if (Math.abs(dx) < 8) return;
    const index = days.findIndex((day) => day.id === activeDayId);
    const atEdge = (dx > 0 && index === 0) || (dx < 0 && index === days.length - 1);
    setOffset(atEdge ? dx * 0.22 : Math.max(-150, Math.min(150, dx)));
  }

  function cancel() {
    gesture.current = null;
    setAnimating(false);
    setOffset(0);
  }

  function end(event: ReactTouchEvent<HTMLElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start) {
      setAnimating(false);
      setOffset(0);
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const index = days.findIndex((day) => day.id === activeDayId);
    const next = dx < 0 ? index + 1 : index - 1;
    const shouldMove =
      Date.now() - start.time <= 900 &&
      Math.abs(dx) >= 64 &&
      Math.abs(dx) >= Math.abs(dy) * 1.25 &&
      next >= 0 &&
      next < days.length;
    setAnimating(true);
    if (!shouldMove) {
      setOffset(0);
      window.setTimeout(() => setAnimating(false), 220);
      return;
    }
    setOffset(dx < 0 ? -window.innerWidth : window.innerWidth);
    window.setTimeout(() => {
      onSelectDay(days[next].id);
      setAnimating(false);
      setOffset(0);
    }, 220);
  }

  return { offset, animating, begin, move, end, cancel };
}
