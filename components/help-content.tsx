import Link from "next/link";
import { Icon } from "./icon";
export function HelpContent() {
  return (
    <div className="help-content">
      <span className="badge purple">EARLY ACCESS</span>
      <p>
        요구사항부터 산출물까지 프로젝트의 맥락을 연결하는 팀
        워크스페이스입니다.
      </p>
      <p>
        프로젝트별 요구사항·화면·프로그램 관리, 연결 추적과 Excel 다운로드가
        구현되어 있습니다. 대시보드에서 프로젝트를 열어 문서를 작성하세요.
      </p>
      <p>
        AI 분석, 프로젝트 편집, 파일 업로드, 팀 초대와 구독 결제는 다음 단계에서
        제공할 예정입니다.
      </p>
      <Link href="/policies" className="button">
        서비스 이용 안내
        <Icon name="external" size={15} />
      </Link>
    </div>
  );
}
