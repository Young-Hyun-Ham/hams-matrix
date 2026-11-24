"use client";

import React from "react";
import {
  Box,
  Typography,
  Select,
  MenuItem,
  FormControl,
  Pagination,
} from "@mui/material";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";

import { COLORS } from "@/app/(builder)/constants/color";

export interface GridPaginationProps {
  /** Current page number (1-based) */
  currentPage: number;
  /** Total number of items */
  totalCount: number;
  /** Number of items per page */
  pageSize: number;
  /** Available page size options */
  pageSizeOptions?: number[];
  /** Unified callback when page or page size changes */
  onPaginationChange: (page: number, pageSize: number) => void;
  /** Whether the pagination is disabled */
  disabled?: boolean;
}

export const GridPagination: React.FC<GridPaginationProps> = ({
  currentPage,
  totalCount,
  pageSize,
  pageSizeOptions = [50, 100, 200, 500],
  onPaginationChange,
  disabled = false,
}) => {
  // Internal handler for page change
  const handlePageChange = (
    event: React.ChangeEvent<unknown>,
    page: number,
  ) => {
    onPaginationChange(page, pageSize);
  };

  // Internal handler for page size change
  const handlePageSizeChange = (event: any) => {
    const newPageSize = parseInt(event.target.value, 10);
    // Reset to page 1 with new page size
    onPaginationChange(1, newPageSize);
  };
  // Calculate values
  const totalPages = Math.ceil(totalCount / pageSize);
  const startItem = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalCount);

  const { t } = useTranslation();

  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "flex-end",
        alignItems: "center",
        gap: 2,
        px: 1,
        py: 1,
      }}
    >
      {/* Page Size - Left */}
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Typography variant="body2" sx={{ color: COLORS.blueGrey[700] }}>
          {t("Page Size")}:
        </Typography>
        <Select
          value={pageSize}
          onChange={handlePageSizeChange}
          disabled={disabled}
          size="small"
          sx={{
            height: 24,
            fontSize: "0.8125rem",
            ".MuiSelect-select": {
              py: 0,
              display: "flex",
              alignItems: "center",
            },
          }}
        >
          {pageSizeOptions.map((option) => (
            <MenuItem key={option} value={option}>
              {option}
            </MenuItem>
          ))}
        </Select>
      </Box>

      {/* Range Text - Middle */}
      <Typography variant="body2" sx={{ color: COLORS.blueGrey[700] }}>
        {startItem} to {endItem} of {totalCount}
      </Typography>

      {/* Pagination - Right */}
      <Pagination
        count={totalPages}
        page={currentPage}
        onChange={handlePageChange}
        color="primary"
        size="small"
        showFirstButton={false}
        showLastButton={false}
        disabled={disabled}
        siblingCount={1}
        boundaryCount={1}
      />
    </Box>
  );
};

export default GridPagination;
