export default function ProfileSkeleton() {
  return (
    <div className="flex items-center space-x-4 rounded-xl border border-gray-200 p-4 shadow-sm bg-white animate-pulse">
      {/* 아바타 영역 스켈레톤 */}
      <div className="h-12 w-12 rounded-full bg-gray-200" />

      {/* 텍스트 영역 스켈레톤 */}
      <div className="flex-1 space-y-2">
        <div className="h-4 w-1/3 rounded bg-gray-200" />
        <div className="h-3 w-4/5 rounded bg-gray-200" />
      </div>
    </div>
  );
}
