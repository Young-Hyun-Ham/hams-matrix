"use client";
import type { ReactNode } from "react";
import { menus } from "@/lib/menus";
import type { MenuKey } from "@/lib/types";
import { Icon } from "@/components/icon";
import { useWorkspace } from "@/stores/workspace";
export function PageHeading({
  section,
  children,
  onAction,
  actionLabel,
}: {
  section: MenuKey;
  children?: ReactNode;
  onAction: () => void;
  actionLabel: string;
}) {
  const menu = menus.find((m) => m.key === section)!;
  const user = useWorkspace((state) => state.user);
  return (
    <div className="page-heading">
      <div>
        <div className="page-title-line">
          <h1>{menu.label}</h1>
          <span className="badge purple">
            {section === "dashboard" ? "WORKSPACE" : "PREVIEW"}
          </span>
        </div>
        <p>{menu.description}</p>
      </div>
      <div className="page-heading-actions">
        {children}
        {user && ["owner", "admin", "member"].includes(user.role) && (
          <button className="button primary" onClick={onAction}>
            <Icon name="plus" size={17} />
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
