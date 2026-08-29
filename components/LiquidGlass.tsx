"use client";

import * as React from "react";

/**
 * iOS 26 "Liquid Glass" refraction, implemented for the web.
 *
 * Real glass bends the light passing through it; the bend is strongest at the
 * curved rim and near-zero across the flat middle. We reproduce that by feeding
 * `feDisplacementMap` a normal/offset map baked from the element's own rounded
 * shape (a signed-distance field with a squircle rim profile), then sampling the
 * live backdrop through it. Splitting the sample into R/G/B at slightly different
 * strengths gives the chromatic fringing at the edge; a separate specular map
 * screens a bright rim highlight on top.
 *
 * `backdrop-filter: url(#id)` referencing an SVG filter only renders in
 * Chromium. Everywhere else this filter is inert, so callers must keep a frosted
 * `backdrop-blur` fallback underneath; see `useRefractionSupported`.
 */

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Signed distance to a rounded rectangle centered at the origin. <0 inside. */
function sdRoundRect(px: number, py: number, halfW: number, halfH: number, r: number) {
  const qx = Math.abs(px) - (halfW - r);
  const qy = Math.abs(py) - (halfH - r);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inside = Math.min(Math.max(qx, qy), 0);
  return outside + inside - r;
}

interface Maps {
  displacement: string;
  specular: string;
}

/**
 * Bake the displacement + specular maps for a given box. Runs on the client
 * only (needs a canvas) and is cheap for tab-bar-sized surfaces, so we memoize
 * on the geometry and regenerate only when it changes.
 */
function buildMaps(w: number, h: number, radius: number, bezel: number): Maps | null {
  if (typeof document === "undefined") return null;
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));

  const disp = document.createElement("canvas");
  disp.width = cw;
  disp.height = ch;
  const spec = document.createElement("canvas");
  spec.width = cw;
  spec.height = ch;
  const dctx = disp.getContext("2d");
  const sctx = spec.getContext("2d");
  if (!dctx || !sctx) return null;

  const dImg = dctx.createImageData(cw, ch);
  const sImg = sctx.createImageData(cw, ch);
  const halfW = cw / 2;
  const halfH = ch / 2;
  const r = Math.min(radius, halfW, halfH);

  // Light comes from the upper-left, the way iOS lights its glass.
  const ll = Math.hypot(0.7, 0.7);
  const lx = -0.7 / ll;
  const ly = -0.7 / ll;

  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const px = x - halfW + 0.5;
      const py = y - halfH + 0.5;
      const sd = sdRoundRect(px, py, halfW, halfH, r);
      const i = (y * cw + x) * 4;

      let rr = 128;
      let gg = 128;
      let specAlpha = 0;

      if (sd < 0) {
        const dist = -sd; // distance inward from the edge
        const t = clamp(dist / bezel, 0, 1); // 0 at rim → 1 in the flat interior

        // Outward normal = gradient of the SDF.
        const gx =
          sdRoundRect(px + 1, py, halfW, halfH, r) - sdRoundRect(px - 1, py, halfW, halfH, r);
        const gy =
          sdRoundRect(px, py + 1, halfW, halfH, r) - sdRoundRect(px, py - 1, halfW, halfH, r);
        const gl = Math.hypot(gx, gy) || 1;
        const nx = gx / gl;
        const ny = gy / gl;

        // Bend concentrated at the rim, flat through the middle (squircle-ish).
        const strength = Math.pow(1 - t, 1.6);
        rr = 128 - nx * strength * 127;
        gg = 128 - ny * strength * 127;

        // Bright rim where the surface faces the light, feathered to the edge.
        const facing = Math.max(0, nx * lx + ny * ly);
        const rim = Math.pow(1 - t, 3);
        specAlpha = clamp(facing * rim * 1.15, 0, 1);
      }

      dImg.data[i] = clamp(rr, 0, 255);
      dImg.data[i + 1] = clamp(gg, 0, 255);
      dImg.data[i + 2] = 128;
      dImg.data[i + 3] = 255;

      sImg.data[i] = 255;
      sImg.data[i + 1] = 255;
      sImg.data[i + 2] = 255;
      sImg.data[i + 3] = Math.round(specAlpha * 255);
    }
  }

  dctx.putImageData(dImg, 0, 0);
  sctx.putImageData(sImg, 0, 0);
  return { displacement: disp.toDataURL(), specular: spec.toDataURL() };
}

/**
 * True only where a browser renders an SVG filter as a backdrop-filter
 * (Chromium and its derivatives). Safari parses the syntax but paints nothing,
 * so a syntax check would lie; we gate on the engine instead.
 */
function refractionSubscribe() {
  return () => {};
}

function refractionSnapshot() {
  if (typeof CSS === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const chromium = /Chrome|Chromium|Edg\//.test(ua) && !/Firefox/.test(ua);
  const syntaxOk = CSS.supports?.("backdrop-filter", "url(#x)") ?? false;
  return chromium && syntaxOk;
}

export function useRefractionSupported() {
  // Engine support never changes at runtime, so this reads once on the client
  // and stays put. `false` on the server keeps SSR and first paint aligned.
  return React.useSyncExternalStore(refractionSubscribe, refractionSnapshot, () => false);
}

export interface LiquidGlassFilterProps {
  id: string;
  width: number;
  height: number;
  radius: number;
  /** Peak refraction offset in px. Higher = more pronounced lensing. */
  scale?: number;
  /** How far the bend reaches inward from the rim, in px. */
  bezel?: number;
}

/**
 * Renders the hidden `<svg><filter>` that a surface references via
 * `backdrop-filter: url(#id)`. Renders nothing until geometry is known.
 */
export function LiquidGlassFilter({
  id,
  width,
  height,
  radius,
  scale = 14,
  bezel = 18,
}: LiquidGlassFilterProps) {
  const maps = React.useMemo(
    () => (width > 0 && height > 0 ? buildMaps(width, height, radius, bezel) : null),
    [width, height, radius, bezel],
  );

  if (!maps) return null;

  return (
    <svg
      aria-hidden
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={id}
          x="-25%"
          y="-25%"
          width="150%"
          height="150%"
          colorInterpolationFilters="sRGB"
          filterUnits="objectBoundingBox"
          primitiveUnits="userSpaceOnUse"
        >
          <feImage
            href={maps.displacement}
            x="0"
            y="0"
            width={width}
            height={height}
            preserveAspectRatio="none"
            result="map"
          />
          {/* Chromatic aberration: displace each channel a touch differently. */}
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={scale * 1.08}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dR"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dG"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="map"
            scale={scale * 0.92}
            xChannelSelector="R"
            yChannelSelector="G"
            result="dB"
          />
          <feColorMatrix
            in="dR"
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="cR"
          />
          <feColorMatrix
            in="dG"
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
            result="cG"
          />
          <feColorMatrix
            in="dB"
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
            result="cB"
          />
          <feBlend in="cR" in2="cG" mode="screen" result="cRG" />
          <feBlend in="cRG" in2="cB" mode="screen" result="rgb" />
          <feGaussianBlur in="rgb" stdDeviation="0.5" result="softened" />
          <feImage
            href={maps.specular}
            x="0"
            y="0"
            width={width}
            height={height}
            preserveAspectRatio="none"
            result="spec"
          />
          <feBlend in="softened" in2="spec" mode="screen" />
        </filter>
      </defs>
    </svg>
  );
}
