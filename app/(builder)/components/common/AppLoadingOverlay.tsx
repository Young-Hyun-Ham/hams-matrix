import { Backdrop, CircularProgress } from "@mui/material";

import { COLORS } from "@/app/(builder)/constants/color";

interface AppLoadingOverlayProps {
  loading: boolean;

  /** full screen or relative container */
  variant?: "fullscreen" | "container";

  /** override zIndex */
  zIndex?: number;
}

export function AppLoadingOverlay({
  loading,
  variant = "container",
  zIndex,
}: AppLoadingOverlayProps) {
  if (!loading) return null;

  return (
    <Backdrop
      open
      sx={{
        position: variant === "fullscreen" ? "fixed" : "absolute",
        color: COLORS.common.white,
        zIndex: zIndex ?? ((theme) => theme.zIndex.drawer + 1),
      }}
    >
      <CircularProgress sx={{ color: COLORS.common.yellow }} />
    </Backdrop>
  );
}
