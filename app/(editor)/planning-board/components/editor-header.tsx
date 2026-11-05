"use client";
import { ThemeToggle } from "@/components/theme-toggle";

import { BoardHistory } from "./board-history";
import Link from "next/link";
import { useState } from "react";
import type { ProjectAccessLevel } from "@/app/(editor)/planning-board/types/permissions";
import { Icon } from "./editor-icon";
import type { TemplateSummary } from "../types/templates";

type EditorHeaderProps = {
  onTemplate: (name: string) => void;
  templates: TemplateSummary[];
  templateError: string;
  onRefreshTemplates: () => void;
  canEdit: boolean;
  title: string;
  saved: string;
  onPreview: () => void;
  projectId?: string;
  access: ProjectAccessLevel;
};

export function EditorHeader({
  onTemplate,
  templates,
  templateError,
  onRefreshTemplates,
  canEdit,
  title,
  saved,
  onPreview,
  projectId,
  access,
}: EditorHeaderProps) {
  return (
    <header className="topbar">
      <div className="brand">
        <Link
          href="/"
          aria-label="Matrix 화면설계 홈으로 이동"
          style={{
            color: "inherit",
            display: "flex",
            alignItems: "center",
            gap: 9,
            textDecoration: "none",
          }}
        >
          <div className="brand-mark">P</div>
          <strong>Matrix 화면설계</strong>
        </Link>
        <span className="beta">BETA</span>
      </div>
      <div className="doc-title">
        <span>{title}</span>
        <small>{saved}</small>
      </div>
      <div className="header-actions">
        <select
          aria-label="템플릿 불러오기"
          disabled={!canEdit}
          value=""
          onChange={(e) => onTemplate(e.target.value)}
        >
          <option value="">템플릿</option>
          {(["builtin", "custom"] as const).map((kind) => (
            <optgroup
              key={kind}
              label={kind === "builtin" ? "기본 템플릿" : "프로젝트 템플릿"}
            >
              {templates
                .filter((item) => item.kind === kind)
                .map((item) => (
                  <option
                    key={`${kind}:${item.id}`}
                    value={`${kind}:${item.id}`}
                  >
                    {item.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        {templateError && (
          <button
            type="button"
            className="plain-button"
            title={templateError}
            onClick={onRefreshTemplates}
          >
            템플릿 목록 다시 조회
          </button>
        )}
        <span className="divider" />
        <BoardHistory />
        <button type="button" className="plain-button" onClick={onPreview}>
          <Icon name="play" /> 미리보기
        </button>
        <ThemeToggle />
      </div>
    </header>
  );
}
