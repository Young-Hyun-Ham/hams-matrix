"use client";
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  TablePagination,
} from "@mui/material";
import { useBuilderStore } from "../../store";
import { getScenarioDeployHistory } from "../../services/backendService";
export default function DeployHistoryListModal({
  isOpen,
  onClose,
  onSelectDeployHistory,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectDeployHistory: (row: any) => void;
}) {
  const { backend, scenario } = useBuilderStore(),
    [page, setPage] = useState(0),
    [size, setSize] = useState(50),
    [data, setData] = useState<{ items: any[]; totalCount: number }>({
      items: [],
      totalCount: 0,
    }),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    let alive = true;
    if (!isOpen || !scenario?.id) return;
    setLoading(true);
    setError("");
    void getScenarioDeployHistory(backend, {
      scenario_id: scenario.id,
      page: page + 1,
      pageSize: size,
    })
      .then((r) => {
        if (alive) setData(r);
      })
      .catch((e) => {
        if (alive) setError(e.message ?? "배포 이력을 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [isOpen, scenario?.id, backend, page, size]);
  return (
    <Dialog open={isOpen} onClose={onClose} fullWidth maxWidth="lg">
      <DialogTitle>배포 버전 지정 이력</DialogTitle>
      <DialogContent>
        {error && <p role="alert">{error}</p>}
        {loading ? (
          <p role="status">조회 중…</p>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                {["지정일", "버전", "사용자", "메모", "선택"].map((x) => (
                  <TableCell key={x}>{x}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {data.items.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>{r.depn_dt}</TableCell>
                  <TableCell>{r.ver_id}</TableCell>
                  <TableCell>{r.depn_usr_id}</TableCell>
                  <TableCell>{r.depn_memo}</TableCell>
                  <TableCell>
                    <Button
                      onClick={() => {
                        onSelectDeployHistory(r);
                        onClose();
                      }}
                    >
                      선택
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <TablePagination
          component="div"
          count={data.totalCount}
          page={page}
          rowsPerPage={size}
          rowsPerPageOptions={[50, 100, 200]}
          onPageChange={(_, p) => setPage(p)}
          onRowsPerPageChange={(e) => {
            setSize(Number(e.target.value));
            setPage(0);
          }}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>닫기</Button>
      </DialogActions>
    </Dialog>
  );
}
