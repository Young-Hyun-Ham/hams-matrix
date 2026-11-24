import { useEffect, useState } from "react";
import ProfileSkeleton from "../ProfileSkeleton";

// 지연 시간을模拟하는 비동기 컴포넌트 (실제 데이터 패칭 영역)
export default function SkeletonPageBody() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setIsLoading(false);
    }, 2000);

    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex items-center space-x-4 rounded-xl border border-gray-200 p-4 shadow-sm bg-white">
      <img
        src="https://github.com/shadcn.png"
        alt="Profile"
        className="h-12 w-12 rounded-full object-cover"
      />
      <div>
        <h3 className="font-semibold text-gray-900">함영현</h3>
        <p className="text-sm text-gray-500">Full-stack Software Developer</p>
      </div>
    </div>
  );
}
