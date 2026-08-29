"use client";

import * as React from "react";
import type { JSX } from "react";
import { useReducedMotion } from "framer-motion";

import {
  applyEvent,
  CELL,
  createField,
  hash2,
  resizeField,
  roundedRectSdf,
  setVoids,
  stepField,
  type FieldState,
  type Rect,
} from "@/lib/landing-field";

const INK = "#0b0a09";
const PIN = "#faf6f0";
const DT_CAP = 1 / 30;
const VOID_RADIUS = 24;
const AUTH_FIELD_IDS = new Set(["auth-email", "auth-password"]);

function isAuthField(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && AUTH_FIELD_IDS.has(target.id);
}

function parseAuthMode(value: string | null): "signin" | "signup" | null {
  if (value === "signin" || value === "signup") return value;
  return null;
}

function rectFromDom(el: Element): Rect {
  const box = el.getBoundingClientRect();
  return {
    x: Math.round(box.x),
    y: Math.round(box.y),
    w: Math.round(box.width),
    h: Math.round(box.height),
  };
}

function collectVoids(host: HTMLElement | null): Rect[] {
  if (!host) return [];
  const nodes = host.querySelectorAll("[data-landing-void]");
  const voids: Rect[] = [];
  nodes.forEach((node) => {
    voids.push({ ...rectFromDom(node), r: VOID_RADIUS });
  });
  return voids;
}

function voidsEqual(a: Rect[], b: Rect[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y || a[i].w !== b[i].w || a[i].h !== b[i].h) {
      return false;
    }
  }
  return true;
}

function segmentHitsVoid(mx: number, my: number, voids: Rect[]): boolean {
  for (const rect of voids) {
    if (roundedRectSdf(mx, my, rect) < 8) return true;
  }
  return false;
}

function applyCanvasSize(canvas: HTMLCanvasElement, width: number, height: number): CanvasRenderingContext2D | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const nextW = Math.max(1, Math.round(width * dpr));
  const nextH = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== nextW) canvas.width = nextW;
  if (canvas.height !== nextH) canvas.height = nextH;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawField(
  ctx: CanvasRenderingContext2D,
  state: FieldState,
  pointerWell: boolean,
): void {
  ctx.fillStyle = INK;
  ctx.fillRect(0, 0, state.width, state.height);

  ctx.strokeStyle = "rgba(232, 220, 200, 0.07)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0, x = 0; x <= state.width; i++, x += CELL) {
    if (hash2(i, 17) < 0.18) continue;
    for (let y = 0; y < state.height; y += CELL) {
      const y2 = Math.min(y + CELL, state.height);
      if (segmentHitsVoid(x, (y + y2) / 2, state.voids)) continue;
      ctx.moveTo(x, y);
      ctx.lineTo(x, y2);
    }
  }
  for (let i = 0, y = 0; y <= state.height; i++, y += CELL) {
    if (hash2(i, 17) < 0.18) continue;
    for (let x = 0; x < state.width; x += CELL) {
      const x2 = Math.min(x + CELL, state.width);
      if (segmentHitsVoid((x + x2) / 2, y, state.voids)) continue;
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y);
    }
  }
  ctx.stroke();

  const particles = state.particles;
  const n = particles.length;
  ctx.strokeStyle = "rgba(232, 220, 200, 0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = particles[i];
    for (let k = 1; k <= 8; k++) {
      const b = particles[(i + k) % n];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      if (dx * dx + dy * dy < 56 * 56) {
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
    }
  }
  ctx.stroke();

  for (const group of state.groups) {
    if (group.phase === "dissolving") continue;
    const ids = group.ids;
    if (ids.length < 2) continue;
    const alpha = group.phase === "locked" ? 0.85 : 0.35 + group.age / 4;
    ctx.strokeStyle = `rgba(234, 115, 23, ${alpha})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let i = 0; i < ids.length; i++) {
      const from = particles[ids[i]];
      const to = particles[ids[(i + 1) % ids.length]];
      if (!from || !to) continue;
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
    }
    ctx.stroke();
  }

  ctx.fillStyle = "rgba(232, 220, 200, 0.85)";
  ctx.beginPath();
  for (const p of particles) {
    ctx.moveTo(p.x + p.size, p.y);
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.fillStyle = PIN;
  ctx.beginPath();
  for (const group of state.groups) {
    const showPin =
      group.phase === "locked" || (group.phase === "seeking" && group.age > 1.2);
    if (!showPin) continue;
    const { venueX: x, venueY: y } = group;
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
  }
  ctx.fill();

  if (pointerWell && state.pointer.active) {
    ctx.strokeStyle = "rgba(234, 115, 23, 0.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(state.pointer.x, state.pointer.y, 28, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function MatchingField(props: {
  hostRef: React.RefObject<HTMLElement | null>;
}): JSX.Element {
  const { hostRef } = props;
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const stateRef = React.useRef<FieldState | null>(null);
  const reduce = useReducedMotion() === true;

  React.useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const state = createField(window.innerWidth, window.innerHeight);
    stateRef.current = state;

    const observedVoids = new Set<Element>();
    let demoEl: Element | null = null;
    let rafId = 0;
    let lastTime = performance.now();

    function getCtx(): CanvasRenderingContext2D | null {
      const el = canvasRef.current;
      if (!el) return null;
      return applyCanvasSize(el, state.width, state.height);
    }

    function paint(): void {
      const ctx = getCtx();
      if (!ctx) return;
      drawField(ctx, state, !reduce);
    }

    function syncVoids(): void {
      const next = collectVoids(hostRef.current);
      if (voidsEqual(state.voids, next)) return;
      setVoids(state, next);
    }

    function syncViewport(): void {
      const width = window.innerWidth;
      const height = window.innerHeight;
      if (width !== state.width || height !== state.height) {
        resizeField(state, width, height);
      }
    }

    function refreshVoidObservers(observer: ResizeObserver): void {
      const host = hostRef.current;
      const nodes = host?.querySelectorAll("[data-landing-void]") ?? [];
      const next = new Set<Element>(nodes);
      for (const el of observedVoids) {
        if (!next.has(el)) {
          observer.unobserve(el);
          observedVoids.delete(el);
        }
      }
      for (const el of next) {
        if (!observedVoids.has(el)) {
          observer.observe(el);
          observedVoids.add(el);
        }
      }
    }

    function onDemoEnter(): void {
      applyEvent(state, { type: "demoHover", on: true });
    }

    function onDemoLeave(): void {
      applyEvent(state, { type: "demoHover", on: false });
    }

    function unbindDemo(): void {
      if (!demoEl) return;
      demoEl.removeEventListener("pointerenter", onDemoEnter);
      demoEl.removeEventListener("pointerleave", onDemoLeave);
      if (state.demoHover) applyEvent(state, { type: "demoHover", on: false });
      demoEl = null;
    }

    function bindDemo(): void {
      const next = hostRef.current?.querySelector("[data-landing-demo]") ?? null;
      if (next === demoEl) return;
      unbindDemo();
      demoEl = next;
      if (!demoEl) return;
      demoEl.addEventListener("pointerenter", onDemoEnter);
      demoEl.addEventListener("pointerleave", onDemoLeave);
    }

    function onResize(): void {
      syncViewport();
      syncVoids();
      paint();
    }

    function onPointerMove(event: PointerEvent): void {
      applyEvent(state, {
        type: "pointer",
        x: event.clientX,
        y: event.clientY,
        active: true,
      });
    }

    function onPointerLeave(): void {
      applyEvent(state, {
        type: "pointer",
        x: state.pointer.x,
        y: state.pointer.y,
        active: false,
      });
    }

    function onFocusIn(event: FocusEvent): void {
      if (!isAuthField(event.target)) return;
      const box = event.target.getBoundingClientRect();
      applyEvent(state, {
        type: "focus",
        rect: { x: box.x, y: box.y, w: box.width, h: box.height },
      });
    }

    function onFocusOut(event: FocusEvent): void {
      if (!isAuthField(event.target)) return;
      if (isAuthField(event.relatedTarget)) return;
      applyEvent(state, { type: "focus", rect: null });
    }

    function onInput(event: Event): void {
      if (!isAuthField(event.target)) return;
      applyEvent(state, { type: "typing", at: state.time });
    }

    const resizeObserver = new ResizeObserver(() => {
      syncViewport();
      refreshVoidObservers(resizeObserver);
      syncVoids();
      if (reduce) paint();
    });

    function onModeMutation(mutations: MutationRecord[]): void {
      for (const mutation of mutations) {
        if (mutation.type === "attributes" && mutation.attributeName === "data-auth-mode") {
          const el = mutation.target;
          if (!(el instanceof HTMLElement)) continue;
          const mode = parseAuthMode(el.getAttribute("data-auth-mode"));
          if (!mode || mode === mutation.oldValue) continue;
          applyEvent(state, { type: "mode", mode, at: state.time });
        }
      }
      bindDemo();
      refreshVoidObservers(resizeObserver);
      syncVoids();
      if (reduce) paint();
    }

    function tick(now: number): void {
      if (document.hidden) {
        lastTime = now;
        rafId = 0;
        return;
      }
      rafId = requestAnimationFrame(tick);
      const dt = Math.min((now - lastTime) / 1000, DT_CAP);
      lastTime = now;
      syncViewport();
      syncVoids();
      stepField(state, dt, false);
      paint();
    }

    function startLoop(): void {
      lastTime = performance.now();
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(tick);
    }

    function onVisibility(): void {
      if (document.hidden) {
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = 0;
        }
        return;
      }
      startLoop();
    }

    const mutationObserver = new MutationObserver(onModeMutation);

    const host = hostRef.current;
    if (host) {
      resizeObserver.observe(host);
      mutationObserver.observe(host, {
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ["data-auth-mode"],
        attributeOldValue: true,
      });
      host.addEventListener("focusin", onFocusIn);
      host.addEventListener("focusout", onFocusOut);
      host.addEventListener("input", onInput);
      refreshVoidObservers(resizeObserver);
      bindDemo();
    }

    window.addEventListener("resize", onResize);
    syncViewport();
    syncVoids();
    paint();

    if (!reduce) {
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", onVisibility);
      startLoop();
    }

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      unbindDemo();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      if (host) {
        host.removeEventListener("focusin", onFocusIn);
        host.removeEventListener("focusout", onFocusOut);
        host.removeEventListener("input", onInput);
      }
      stateRef.current = null;
    };
  }, [hostRef, reduce]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 h-dvh w-dvw"
    />
  );
}
