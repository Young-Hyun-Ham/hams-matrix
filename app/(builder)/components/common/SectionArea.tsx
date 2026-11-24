import { Box, BoxProps } from "@mui/material";
import { ReactNode } from "react";
import { COLORS } from "@/app/(builder)/constants/color";

import { SxProps, Theme } from "@mui/material";

interface SectionAreaProps extends BoxProps {
  children?: ReactNode;
  sx?: SxProps<Theme>;
}

const SectionArea = ({ children, sx, ...props }: SectionAreaProps) => {
  return (
    <Box
      component="section"
      sx={[
        {
          flex: 1,
          display: "flex",
          flexDirection: "column",
          border: 1,
          width: "100%",
          height: "100%",
          borderColor: "var(--builder-border)",
          borderRadius: 2,
          gap: 1,
          p: 1.5,
        },
        ...(Array.isArray(sx) ? sx : sx ? [sx] : []),
      ]}
      {...props}
    >
      {children}
    </Box>
  );
};

export default SectionArea;
