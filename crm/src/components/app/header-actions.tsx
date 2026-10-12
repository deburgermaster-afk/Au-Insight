"use client";

import { type ReactNode, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

const noop = () => () => {};

/** Renders a page's actions (New client, Compose…) into the app header's right side. */
export function HeaderActions({ children }: { children: ReactNode }) {
  const el = useSyncExternalStore(
    noop,
    () => document.getElementById("header-actions"),
    () => null,
  );
  return el ? createPortal(children, el) : null;
}
