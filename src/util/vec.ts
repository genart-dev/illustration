/**
 * 2D vector math utilities for normal/tangent computation, distances, and angles.
 */

import type { Point2D } from "../types.js";

/** Distance between two points. */
export function dist(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Squared distance (avoids sqrt when only comparing). */
export function dist2(a: Point2D, b: Point2D): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return dx * dx + dy * dy;
}

/** Linearly interpolate between two points. */
export function lerp(a: Point2D, b: Point2D, t: number): Point2D {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

/** Unit tangent vector from a to b. Returns {0,0} if coincident. */
export function tangent(a: Point2D, b: Point2D): Point2D {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-10) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Left-hand normal of a tangent vector (rotate 90° CCW). */
export function normalLeft(t: Point2D): Point2D {
  return { x: -t.y, y: t.x };
}

/** Right-hand normal of a tangent vector (rotate 90° CW). */
export function normalRight(t: Point2D): Point2D {
  return { x: t.y, y: -t.x };
}

/** Dot product of two vectors. */
export function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

/** 2D cross product (z-component of 3D cross). */
export function cross(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

/** Vector length. */
export function length(v: Point2D): number {
  return Math.sqrt(v.x * v.x + v.y * v.y);
}

/** Normalize a vector to unit length. Returns {0,0} if zero-length. */
export function normalize(v: Point2D): Point2D {
  const len = length(v);
  if (len < 1e-10) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

/** Add two vectors. */
export function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

/** Subtract b from a. */
export function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

/** Scale a vector. */
export function scale(v: Point2D, s: number): Point2D {
  return { x: v.x * s, y: v.y * s };
}

/** Angle of vector from positive x-axis (radians, -π to π). */
export function angle(v: Point2D): number {
  return Math.atan2(v.y, v.x);
}

/**
 * Average tangent at a vertex between two edges.
 * Used for computing smooth normals at polyline vertices.
 */
export function averageTangent(prev: Point2D, curr: Point2D, next: Point2D): Point2D {
  const t1 = tangent(prev, curr);
  const t2 = tangent(curr, next);
  const avg = { x: t1.x + t2.x, y: t1.y + t2.y };
  return normalize(avg);
}
