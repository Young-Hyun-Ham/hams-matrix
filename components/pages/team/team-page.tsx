"use client";
import { Icon } from "@/components/icon";
import { PageHeading } from "@/components/shared/page-heading";
import { PreviewDialog } from "@/components/shared/preview-dialog";
import { usePreviewDialog } from "@/components/shared/use-preview-dialog";
import { SampleNotice } from "@/components/shared/sample-notice";
import { useState } from "react";
import { ProjectFilter } from "@/components/shared/project-filter";
import "./team-page.css";
import type { User } from "@/lib/types";
import { TeamMembership } from "./team-membership";

export function TeamPage({ user }: { user: User }) {
  const { detail, preview, close } = usePreviewDialog();
  const [project, setProject] = useState("전체 프로젝트");

  return (
    <>
      <PageHeading
        section="team"
        actionLabel="공유 글 작성"
        onAction={() =>
          preview(
            "새 항목 등록",
            "등록·수정·삭제 기능은 다음 개발 단계에서 제공됩니다. 현재 화면은 레이아웃과 사용 흐름을 확인하는 퍼블리싱 미리보기입니다.",
          )
        }
      >
        <ProjectFilter value={project} onChange={setProject} />
      </PageHeading>
      <TeamMembership user={user} />
      <SampleNotice />
      <div className="team-layout">
        <section className="panel">
          <div className="panel-heading">
            <h2>
              팀 이야기 <span>3</span>
            </h2>
            <span className="badge gray">샘플 게시글</span>
          </div>
          {[
            {
              name: "김민지",
              tag: "공지",
              title: "우리 팀의 첫 번째 워크스페이스에 오신 걸 환영해요 👋",
              body: "프로젝트의 중요한 결정과 아이디어를 이곳에 남겨 주세요. 작은 공유가 더 나은 협업의 시작이 됩니다.",
              time: "오늘 오전 10:30",
              comments: 4,
            },
            {
              name: "박지우",
              tag: "디자인",
              title: "브랜드 웹사이트 화면 설계 초안을 공유합니다",
              body: "로그인과 대시보드 화면의 첫 번째 설계를 정리했어요. 연결된 요구사항을 함께 확인하고 의견을 나눠 주세요.",
              time: "어제 오후 3:20",
              comments: 7,
            },
            {
              name: "이서준",
              tag: "개발",
              title: "이번 주 개발 진행 상황 & 다음 단계",
              body: "인증 흐름과 데이터 구조를 정리했어요. 각 기능의 예외 처리와 권한 범위를 함께 검토하면 좋겠습니다.",
              time: "어제 오전 11:00",
              comments: 2,
            },
          ].map((post, i) => (
            <article className="team-post" key={i}>
              <div>
                <span
                  className={`activity-avatar ${["purple", "blue", "green"][i]}`}
                >
                  {post.name.charAt(0)}
                </span>
                <span>
                  <strong>{post.name}</strong>
                  <small>{post.time}</small>
                </span>
                <span className="badge purple">{post.tag}</span>
              </div>
              <button onClick={() => preview(post.title, post.body)}>
                <h3>{post.title}</h3>
              </button>
              <p>{post.body}</p>
              <button
                className="post-comments"
                onClick={() =>
                  preview(
                    "댓글 미리보기",
                    "팀의 의견과 피드백이 모이는 공간입니다. 댓글 작성과 실시간 공유 기능은 준비 중입니다.",
                  )
                }
              >
                의견 {post.comments}개<Icon name="chevron" size={12} />
              </button>
            </article>
          ))}
        </section>
        <aside className="panel team-members-panel">
          <div className="panel-heading">
            <h2>함께하는 사람들</h2>
            <span className="badge purple">샘플</span>
          </div>
          <div className="team-member-list">
            {["김민지", "박지우", "이서준", "정하윤", "최도윤"].map(
              (name, i) => (
                <div key={name}>
                  <span
                    className={`activity-avatar ${["purple", "blue", "green", "orange", "purple"][i]}`}
                  >
                    {name.charAt(0)}
                  </span>
                  <span>
                    <strong>{name}</strong>
                    <small>
                      {
                        [
                          "프로젝트 매니저",
                          "UI/UX 디자이너",
                          "프론트엔드 개발자",
                          "서비스 기획자",
                          "백엔드 개발자",
                        ][i]
                      }
                    </small>
                  </span>
                  <i className={i < 3 ? "online" : "offline"} />
                </div>
              ),
            )}
          </div>
          <button
            className="button invite-button"
            onClick={() =>
              preview(
                "팀원 초대",
                "이메일 초대와 워크스페이스 역할 관리 기능을 준비하고 있습니다. 현재 초대 메일은 발송되지 않습니다.",
              )
            }
          >
            <Icon name="plus" size={16} />
            팀원 초대하기
          </button>
        </aside>
      </div>
      <PreviewDialog detail={detail} onClose={close} />
    </>
  );
}
