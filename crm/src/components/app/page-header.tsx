import type { ReactNode } from "react";
import { HeaderActions } from "./header-actions";

/**
 * Pages no longer show a title block (the breadcrumb names the page); their actions move into
 * the app header so the content gets the full height.
 */
export function PageHeader({ actions }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return actions ? <HeaderActions>{actions}</HeaderActions> : null;
}
