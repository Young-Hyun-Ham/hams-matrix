// app/providers.tsx
"use client";
import { RequestError } from "@/lib/query/error-messages";

import {
  QueryClient,
  QueryCache,
  QueryClientProvider,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode } from "react";

let browserClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return new QueryClient();
  return (browserClient ??= new QueryClient({
    queryCache: new QueryCache({
      onError(error, query) {
        const key = query.queryKey;
        if (
          error instanceof RequestError &&
          key[0] === "matrix" &&
          key[1] !== "public" &&
          typeof key[1] === "string" &&
          typeof key[2] === "string"
        )
          error.scope = { userId: key[1], workspaceId: key[2] };
      },
    }),
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false },
      mutations: { retry: false },
    },
  }));
}
export default function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
