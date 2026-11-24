import {
  Typography,
  Box,
  TextField,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
} from "@mui/material";

import { GridElement } from "../type";

function GridDataEditor({
  element,
  onChange,
  isReadonly = false,
}: {
  element: GridElement;
  onChange: (data: string[]) => void;
  isReadonly?: boolean;
}) {
  const updateCell = (index: number, value: string) => {
    const nextData = Array.from(
      { length: element.rows * element.columns },
      (_, cellIndex) => element.data[cellIndex] ?? "",
    );
    nextData[index] = value;
    onChange(nextData);
  };

  return (
    <Box>
      <Typography
        variant="caption"
        sx={{
          fontWeight: 700,
          color: "text.secondary",
          ...{ display: "block", mb: 0.75 },
        }}
      >
        Data
      </Typography>
      <TableContainer
        component={Paper}
        variant="outlined"
        sx={{
          maxWidth: "100%",
          overflow: "auto",
          borderRadius: 1,
        }}
      >
        <Table
          size="small"
          sx={{
            tableLayout: "fixed",
            minWidth: Math.max(260, element.columns * 96),
            "& .MuiTableCell-root": {
              p: 0.75,
              borderColor: "grey.200",
            },
          }}
        >
          <TableBody>
            {Array.from({ length: element.rows }, (_, rowIndex) => (
              <TableRow key={rowIndex}>
                {Array.from({ length: element.columns }, (_, columnIndex) => {
                  const index = rowIndex * element.columns + columnIndex;

                  return (
                    <TableCell key={columnIndex}>
                      <TextField
                        slotProps={{
                          htmlInput: {
                            "aria-label": `Grid cell ${rowIndex + 1}, ${
                              columnIndex + 1
                            }`,
                          },
                        }}
                        size="small"
                        fullWidth
                        value={element.data[index] ?? ""}
                        placeholder={`${rowIndex + 1},${columnIndex + 1}`}
                        onChange={(event) =>
                          !isReadonly && updateCell(index, event.target.value)
                        }
                        onKeyDown={(event) => event.stopPropagation()}
                        sx={{
                          "& .MuiOutlinedInput-root": {
                            bgcolor: "background.paper",
                          },
                        }}
                      />
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}

export default GridDataEditor;
