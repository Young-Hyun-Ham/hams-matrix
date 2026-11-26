"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "@/app/(builder)/hooks/useTranslation";
import { AddCircle } from "@mui/icons-material";
import {
  Box,
  Button,
  IconButton,
  Typography,
  Dialog,
  Tooltip,
} from "@mui/material";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import BookmarkIcon from "@mui/icons-material/Bookmark";
import BookmarkBorderIcon from "@mui/icons-material/BookmarkBorder";
import { toggleScenarioCommand } from "../../services/tursoApi";
import BuildIcon from "@mui/icons-material/Build";
import AppRegistrationIcon from "@mui/icons-material/AppRegistration";
import CloseIcon from "@mui/icons-material/Close";
import { format } from "@/app/(builder)/utils/date";

import { useBuilderStore } from "../../store/index";
import { Scenario } from "../../types/types";
import { ScenarioThumbnail } from "../../components/ScenarioThumbnail";
import { ScenarioCard } from "../../components/ScenarioCard";
import {
  ScenarioTypeBadge,
  ScenarioTypeSelector,
} from "../../components/ScenarioType";
import { getScenarioType } from "../../utils/scenarioTypes";

import { COLORS } from "@/app/(builder)/constants/color";
import SelectWithLabel from "@/app/(builder)/components/common/Select";
import InputWithLabel from "@/app/(builder)/components/common/Input";
import { formatDateTime } from "../../utils/util";
import { AppLoadingOverlay } from "@/app/(builder)/components/common/AppLoadingOverlay";
import { useModal } from "@/app/(builder)/providers/ModalProvider";

import { useBuilderRuntime as useStore } from "@/app/(builder)/providers/runtime";

const SCENARIO_SEARCH_OPTIONS = [{ label: "Scenario Name", value: "scenario" }];

type SearchFilter = {
  type?: string;
  name?: string;
  deployment?: string;
  period?: string;
  sortOrder?: string;
};

type MODE = "create" | "edit" | null;

function getLastUsedTime(scenario: Scenario): number {
  const value = scenario.lastUsedAt ?? scenario.last_used_at;
  if (value == null) return 0;
  const time =
    typeof value.toMillis === "function"
      ? value.toMillis()
      : typeof value.seconds === "number"
        ? value.seconds * 1000 + (value.nanoseconds ?? 0) / 1000000
        : new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

// ===========================================
type ScenarioItem = Scenario & {
  groupId?: string;
  versions?: string;
  isDistribute?: boolean;
};

// ===========================================

const ScenarioList = () => {
  const { t } = useTranslation();
  const { showAlert } = useModal();
  const router = useRouter();
  const [commandSaving, setCommandSaving] = useState(false);
  const [commandError, setCommandError] = useState("");
  const [loading, setLoading] = useState(false);
  const [scenarioDetail, setScenarioDetail] = useState<Scenario | null>(null);
  const [mode, setMode] = useState<MODE>(null);
  const [selectedScenario, setSelectedScenario] = useState(false);
  const [selectedScenarioId, setSelectedScenarioId] = useState("");

  const {
    scenario,
    setScenario,
    scenarios,
    setScenarios,
    fetchScenario,
    fetchScenarios,
    createScenario,
    patchScenario,
    deleteScenario,
    cloneScenario,
    setNodes,
    setEdges,
    setStartNodeId,
  } = useBuilderStore() as any;

  const {
    register,
    handleSubmit,
    reset,
    getValues: getSearchValues,
  } = useForm<SearchFilter>({
    defaultValues: {
      type: "scenario",
      name: "",
      deployment: "all",
      period: "all",
      sortOrder: "lastUsed",
    },
  });
  const onSubmit = (data?: SearchFilter, keepEditorOpen?: boolean) => {
    // console.log('search data : ', data);
    loadAll([fetchData(data, keepEditorOpen)]);
  };

  const loadAll = useCallback(async (tasks: any) => {
    setLoading(true);
    try {
      await Promise.all(tasks);
    } catch (err) {
      alert("Something wrong!!!");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchData = useCallback(
    async (filters?: SearchFilter, keepEditorOpen?: boolean) => {
      try {
        if (!keepEditorOpen) {
          setMode(null);
          setSelectedScenario(false);
        }
        const data: any = await fetchScenarios(filters);
        // console.log('==========================> fetchData : ', data, );
        // Default to most recently used, including Firebase Timestamp values.
        const sortOrder = filters?.sortOrder || "lastUsed";
        let sortedData = [...data];

        if (sortOrder === "lastUsed") {
          sortedData.sort(
            (a: Scenario, b: Scenario) =>
              getLastUsedTime(b) - getLastUsedTime(a),
          );
        } else if (sortOrder === "name") {
          // Sort alphabetically by name (A-Z)
          sortedData.sort((a: any, b: any) => {
            const nameA = a.name || "";
            const nameB = b.name || "";
            return nameA.localeCompare(nameB, "ko", { sensitivity: "base" });
          });
        } else if (sortOrder === "deployed") {
          // Sort by deployment (latest deployment first)
          sortedData.sort((a: any, b: any) => {
            if (a.depn_ver_id && !b.depn_ver_id) return -1;
            if (!a.depn_ver_id && b.depn_ver_id) return 1;
            if (a.depn_ver_id && b.depn_ver_id) {
              const valA = String(a.depn_ver_id);
              const valB = String(b.depn_ver_id);
              return valB.localeCompare(valA, undefined, { numeric: true });
            }
            const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return dateB - dateA;
          });
        } else {
          // Default: Sort descending by updated_at (latest first)
          sortedData.sort((a: any, b: any) => {
            const dateA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
            const dateB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
            return dateB - dateA;
          });
        }

        // Filter by deployment status
        if (filters?.deployment === "deployed") {
          sortedData = sortedData.filter((s: any) => !!s.depn_ver_id);
        } else if (filters?.deployment === "undeployed") {
          sortedData = sortedData.filter((s: any) => !s.depn_ver_id);
        }

        // Filter by period (today, week, all)
        const period = filters?.period || "all";
        if (period === "today") {
          const startOfToday = new Date();
          startOfToday.setHours(0, 0, 0, 0);
          sortedData = sortedData.filter((s: any) => {
            const date = s.updated_at || s.updatedAt;
            return date
              ? new Date(date).getTime() >= startOfToday.getTime()
              : false;
          });
        } else if (period === "week") {
          const oneWeekAgo = new Date();
          oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
          sortedData = sortedData.filter((s: any) => {
            const date = s.updated_at || s.updatedAt;
            return date
              ? new Date(date).getTime() >= oneWeekAgo.getTime()
              : false;
          });
        }

        setScenarios(sortedData);
      } catch (error) {
        console.error("Error fetching rows:", error);
        throw new Error("Failed to fetch");
      }
    },
    [scenarios, setScenarios],
  );

  useEffect(() => {
    // admin sidebar를 닫는 로직 추가
    onSubmit(getSearchValues());
  }, []);

  const {
    handleSubmit: handleFormSubmit,
    reset: formReset,
    control,
    getValues,
    setValue,
  } = useForm<any>({
    defaultValues: {
      id: "",
      name: "",
      description: "",
      scenario_type: "sub",
      created_at: "",
      updated_at: "",
      last_used_at: "",
    },
  });
  const onFormSubmit = (data?: any) => {
    console.log(data);
  };

  const [headerName, headerType] = useWatch({
    control,
    name: ["name", "scenario_type"],
  });
  const headerVersion =
    mode === "edit"
      ? (scenarioDetail?.ltst_ver_id ?? scenario?.ltst_ver_id)
      : null;

  const handleCloseScenario = () => {
    setCommandError("");
    if (mode === "create") {
      setScenarios(scenarios.filter((item: Scenario) => Boolean(item.id)));
    }
    setMode(null);
    setSelectedScenario(false);
    setSelectedScenarioId("");
  };

  useEffect(() => {
    let cancelled = false;
    const getScenario = async () => {
      try {
        setLoading(true);
        setSelectedScenario(true);

        const [scenarioData] = await Promise.all([fetchScenario(scenario?.id)]);
        if (cancelled) return;
        // console.log('==========================> 재조회 scenarioData : ', scenario);
        if (scenarioData) {
          setScenarioDetail({ ...scenarioData, id: scenario.id });
          formReset({
            id: scenarioData.id,
            name: scenarioData.name,
            description: scenarioData.description,
            scenario_type: getScenarioType(scenarioData),
            created_at: formatDateTime(
              scenarioData.created_at || scenarioData.createdAt,
            ),
            updated_at: formatDateTime(
              scenarioData.updated_at || scenarioData.updatedAt,
            ),
            last_used_at: formatDateTime(
              scenarioData.last_used_at || scenarioData.lastUsedAt,
            ),
          });
        }
      } catch (e: any) {
        console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    setScenarioDetail(null);
    if (mode === "edit") {
      getScenario();
    } else {
      setLoading(false);
      const createData: any[] = scenarios.filter((item: any) => !item.id);
      formReset({
        id: createData[0]?.id ?? "",
        name: createData[0]?.name ?? "",
        description: createData[0]?.description ?? "",
        scenario_type: getScenarioType(createData[0]),
        created_at: formatDateTime(createData[0]?.created_at) ?? "",
        updated_at: formatDateTime(createData[0]?.updated_at) ?? "",
        last_used_at: formatDateTime(createData[0]?.updated_at) ?? "",
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, scenario?.id, formReset]);

  const handleSelectScenario = async (data?: Scenario) => {
    // console.log('select scenario ==================> : ', data);
    setMode(data?.id ? "edit" : "create");
    setSelectedScenario(true);
    setScenario(data);
    setSelectedScenarioId(data?.id ?? "");
  };

  const handleAddScenario = async () => {
    const isChk = scenarios.some((item: any) => !item.id);
    if (isChk) return;

    formReset({
      id: "",
      name: "",
      description: "",
      scenario_type: "sub",
      created_at: "",
      updated_at: "",
      last_used_at: "",
    });

    const data: Scenario = {
      name: "",
      description: "",
      scenario_type: "sub",
    };
    await setScenarios([data, ...scenarios]);

    setMode("create");
    setSelectedScenario(true);
    setScenario(data);
    setSelectedScenarioId("");
  };

  const handleMoveScenario = async (data?: Scenario) => {
    if (data?.id) {
      setScenario(data);
      router.push(
        `/react-flow/scenario-flow?scenarioId=${encodeURIComponent(data?.id ?? scenario?.id ?? "")}`,
      );
    }
  };

  const handleMoveTempScenario = async (data?: Scenario) => {
    if (data?.id) {
      setScenario(data);
      router.push(
        `/react-flow/scenario-flow?scenarioId=${encodeURIComponent(data?.id ?? scenario?.id ?? "")}`,
      );
    }
  };
  const handleVersionViewScenario = async (data?: Scenario) => {
    if (data?.id) {
      setScenario(data);
      setEdges([]);
      setStartNodeId(null);
      router.push(
        `/react-flow/scenario-view?scenarioId=${encodeURIComponent(data?.id ?? scenario?.id ?? "")}`,
      );
    }
  };

  const handleEditScenario = async (data: Scenario) => {
    setMode("edit");
    // console.log('==========================> Edit : ', data);
    setScenario(data);
    setSelectedScenarioId(data?.id ?? "");
  };

  const handleDeleteScenario = async (data?: Scenario) => {
    // console.log('==========================> Delete : ', data);
    const deleteDatas: string[] = [];
    deleteDatas.push(data?.id ?? "");
    await deleteScenario(deleteDatas);
    onSubmit();
  };

  const handleSaveScenario = async () => {
    const name = String(getValues("name") ?? "").trim();
    if (!name) {
      await showAlert(t("Please enter a scenario name."));
      return;
    }
    const payload = {
      ...getValues(),
      name,
      scenario_type: getScenarioType(getValues()),
      id: scenario.id,
    };
    // console.log('==========================> save : ', mode, payload);
    let res: any = null;
    if (mode === "edit") {
      const { nodes, edges, start_node_id, ...patchData } = payload;
      res = await patchScenario(patchData);
      if (res) setScenario({ ...scenario, ...res, id: scenario.id, name });
    } else {
      res = await createScenario(payload);
      if (res) {
        setMode("edit");
        setScenario(res);
        setSelectedScenarioId(res.id ?? "");
      }
    }
    setSelectedScenario(false);
    setSelectedScenarioId("");
    setMode(null);
    onSubmit(getSearchValues());
    await showAlert("저장되었습니다.");
  };

  const handleDataChange = (type: string, data: string) => {
    const selectedId = scenario.id;

    setScenarios(
      scenarios.map((s: Scenario) => {
        if (selectedId && s.id === selectedId) {
          return { ...s, [type]: data };
        }
        if (!selectedId && !s.id) {
          return { ...s, [type]: data };
        }
        return s;
      }),
    );
  };

  const handleCloneScenario = async (data: Scenario) => {
    const resData = await fetchScenario(data?.id);
    const newData = {
      ...resData,
      clone_from_id: data.id,
      id: "",
      name: `[clone]_${data.name}`,
    };
    await cloneScenario(newData);
    onSubmit();
  };

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        ...{ minHeight: 0 },
      }}
    >
      <AppLoadingOverlay loading={loading} />
      <Box sx={{ display: "flex", flex: 1, minHeight: 0, gap: 1 }}>
        <Box sx={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <Box sx={{ px: 2, pt: "10px" }}>
            <Box
              sx={{
                border: 1,
                borderColor: "var(--builder-border)",
                borderRadius: 2,
                p: 1.5,
              }}
            >
              <form
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
                onSubmit={handleSubmit((data) => onSubmit(data))}
              >
                <SelectWithLabel
                  label={t("Sort Order")}
                  size="small"
                  sx={{ minWidth: 160 }}
                  defaultValue={"lastUsed"}
                  options={[
                    { label: t("Last Used Date"), value: "lastUsed" },
                    { label: t("Last Updated"), value: "updated" },
                    { label: t("Name"), value: "name" },
                    { label: t("Last Deployed"), value: "deployed" },
                  ]}
                  {...register("sortOrder", {
                    onChange: (e) => {
                      onSubmit({
                        ...getSearchValues(),
                        sortOrder: e.target.value,
                      });
                    },
                  })}
                />
                <SelectWithLabel
                  label={t("Period")}
                  size="small"
                  sx={{ minWidth: 160 }}
                  defaultValue={"all"}
                  options={[
                    { label: t("All"), value: "all" },
                    { label: t("Today"), value: "today" },
                    { label: t("1 Week"), value: "week" },
                  ]}
                  {...register("period", {
                    onChange: (e) => {
                      onSubmit({
                        ...getSearchValues(),
                        period: e.target.value,
                      });
                    },
                  })}
                />
                <SelectWithLabel
                  label={t("Deployment Status")}
                  size="small"
                  sx={{ minWidth: 160 }}
                  defaultValue={"all"}
                  options={[
                    { label: t("All"), value: "all" },
                    { label: t("Deployed"), value: "deployed" },
                    { label: t("Not Deployed"), value: "undeployed" },
                  ]}
                  {...register("deployment", {
                    onChange: (e) => {
                      onSubmit({
                        ...getSearchValues(),
                        deployment: e.target.value,
                      });
                    },
                  })}
                />
                {/* <SelectWithLabel
                  label={t('Type')}
                  size="small"
                  sx={{ minWidth: 160 }}
                  defaultValue={'scenario'}
                  options={SCENARIO_SEARCH_OPTIONS}
                  {...register('type')}
                /> */}
                <InputWithLabel
                  label={t("Name")}
                  sx={{ minWidth: 320 }}
                  size="small"
                  placeholder={t("Please enter your search scenario name")}
                  onKeyDown={(e: any) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSubmit((data) => onSubmit(data))();
                    }
                  }}
                  {...register("name")}
                />
                <Box
                  sx={{ flex: 1, ...{ alignSelf: "stretch" } }}
                  onClick={() => {
                    setMode(null);
                    setSelectedScenario(false);
                  }}
                />
                <IconButton
                  size="small"
                  onClick={() => {
                    setMode(null);
                    setSelectedScenario(false);
                    reset();
                    setTimeout(() => {
                      onSubmit(getSearchValues());
                    }, 0);
                  }}
                  sx={{
                    border: 1,
                    borderColor: "var(--builder-border)",
                    width: 32,
                    height: 32,
                  }}
                >
                  <RestartAltIcon />
                </IconButton>
                <Button type="submit" variant="contained" size="small">
                  {t("Search")}
                </Button>
              </form>
            </Box>
          </Box>

          {/* List와 Editor를 감싸는 수평 Flex 컨테이너 */}
          <Box
            // 수평 배치
            // 남은 세로 공간 모두 차지
            sx={{
              display: "flex",
              flexDirection: "row",
              flexGrow: 1,
              ...{ minHeight: 0, overflow: "hidden" },
            }} // 스크롤은 자식에서 개별 처리
          >
            {/* 1. 시나리오 리스트 영역 */}
            <Box
              sx={{
                flexGrow: 1,
                p: 2,
                ...{
                  overflow: "auto",
                  minWidth: "184px",
                },
              }}
            >
              <Box
                aria-label="Chunks"
                sx={{
                  mt: 1.5,
                  display: "grid",
                  gap: 1.5,
                  px: 2,
                  ...{
                    gridTemplateColumns: "repeat(auto-fit, minmax(252px, 1fr))",
                    gridAutoRows: "80px",
                    alignItems: "stretch",
                  },
                }}
              >
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    alignItems: "center",
                    gap: 0.5,
                    ...{
                      border: "2px dashed",
                      borderColor: "var(--builder-border)",
                      borderRadius: 2,
                      cursor: "pointer",
                      height: "100%",
                    },
                  }}
                  onClick={() => {
                    handleAddScenario();
                  }}
                >
                  <AddCircle sx={{ color: "primary.main" }} />
                  <Typography
                    sx={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: "primary.main",
                    }}
                  >
                    {t("New Job")}
                  </Typography>
                </Box>
                {scenarios.map((data: any, index: any) => (
                  <Fragment key={index}>
                    <ScenarioCard
                      scenario={data}
                      selected={selectedScenarioId === (data.id ?? "")}
                      onSelect={handleSelectScenario}
                      onEdit={handleEditScenario}
                      onDelete={handleDeleteScenario}
                      onMove={handleMoveScenario}
                      onClone={handleCloneScenario}
                    />
                  </Fragment>
                ))}
              </Box>
            </Box>
            {/* // 1. 시나리오 리스트 영역 끝 */}

            {/* 2. 편집 화면 영역 (selectedScenario가 true일 때만 모달 팝업으로 렌더링) */}
            <Dialog
              slotProps={{
                paper: {
                  sx: {
                    borderRadius: 2,
                    border: 2,
                    borderColor: "primary.main",
                    overflow: "hidden",
                    ...(mode === "edit" && {
                      height: "814px",
                      maxHeight: "calc(100dvh - 51px)",
                    }),
                  },
                },
              }}
              open={selectedScenario}
              onClose={handleCloseScenario}
              aria-labelledby="scenario-editor-title"
              maxWidth="sm"
              fullWidth
            >
              <form
                onSubmit={handleFormSubmit(onFormSubmit)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  width: "100%",
                }}
              >
                {/* 전체 Edit Data 컨테이너 */}
                <Box
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 1,
                    p: 2,
                  }}
                >
                  {/* "Edit Data" 타이틀 */}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      mb: 1,
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        gap: 1,
                        ...{ minWidth: 0 },
                      }}
                    >
                      <ScenarioTypeBadge
                        scenario={{ scenario_type: headerType }}
                      />
                      <Typography
                        id="scenario-editor-title"
                        component="h2"
                        noWrap
                        title={headerName || scenario?.name || t("New Job")}
                        sx={{
                          fontSize: 16,
                          fontWeight: 700,
                          color: "text.primary",
                          ...{ minWidth: 0 },
                        }}
                      >
                        {headerName || scenario?.name || t("New Job")}
                      </Typography>
                      <Typography
                        variant="caption"
                        sx={{ color: "text.secondary", ...{ flexShrink: 0 } }}
                      >
                        {headerVersion !== undefined &&
                        headerVersion !== null &&
                        String(headerVersion).trim() !== ""
                          ? `v.${String(headerVersion).replace(/^v[.\s]*/i, "")}`
                          : t("Draft")}
                      </Typography>
                    </Box>
                    <Tooltip title={t("Close")} arrow>
                      <IconButton
                        type="button"
                        size="small"
                        aria-label={t("Close")}
                        onClick={handleCloseScenario}
                        sx={{ ml: 1, flexShrink: 0 }}
                      >
                        <CloseIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </Box>
                  {mode === "edit" && (
                    <Box
                      sx={{
                        p: 2,
                        mb: 1,
                        border: 1,
                        borderColor: "divider",
                        borderRadius: 1.5,
                        bgcolor: "background.paper",
                      }}
                    >
                      <Box
                        sx={{
                          display: "grid",
                          gridTemplateColumns: {
                            xs: "1fr",
                            sm: "minmax(0, 1fr) minmax(0, 1.2fr)",
                          },
                          gap: 2,
                        }}
                      >
                        <ScenarioThumbnail
                          nodes={scenarioDetail?.nodes ?? []}
                          edges={scenarioDetail?.edges ?? []}
                          emptyLabel={t(
                            loading ? "Loading..." : "No scenario nodes",
                          )}
                        />
                        <Box
                          component="dl"
                          sx={{
                            m: 0,
                            display: "grid",
                            gridTemplateColumns: "auto minmax(0, 1fr)",
                            alignContent: "center",
                            alignItems: "center",
                            columnGap: 1.5,
                            rowGap: 1,
                          }}
                        >
                          {[
                            [
                              t("Last Used Date"),
                              scenarioDetail?.last_used_at ||
                              scenarioDetail?.lastUsedAt
                                ? formatDateTime(
                                    scenarioDetail.last_used_at ||
                                      scenarioDetail.lastUsedAt,
                                  )
                                : "-",
                            ],
                            [
                              t("Last Editor"),
                              scenarioDetail?.upd_user_id ??
                                scenarioDetail?.updated_by ??
                                scenarioDetail?.updatedBy ??
                                "-",
                            ],
                            [
                              t("Latest Version"),
                              scenarioDetail?.ltst_ver_id ?? "-",
                            ],
                            [
                              t("Deploy Version"),
                              scenarioDetail?.depn_ver_id ?? "-",
                            ],
                          ].map(([label, value]) => (
                            <Fragment key={label}>
                              <Typography
                                sx={{ color: "text.secondary" }}
                                component="dt"
                                variant="caption"
                              >
                                {label}
                              </Typography>
                              <Typography
                                component="dd"
                                variant="caption"
                                sx={{ m: 0, overflowWrap: "anywhere" }}
                              >
                                {String(value ?? "-")}
                              </Typography>
                            </Fragment>
                          ))}
                          <Box
                            sx={{
                              gridColumn: "1 / -1",
                              display: "flex",
                              justifyContent: "flex-end",
                            }}
                          >
                            <Tooltip
                              title={
                                scenarioDetail?.commandEnabled
                                  ? "커맨드에 추가됨 (ON)"
                                  : "커맨드에 추가 (OFF)"
                              }
                              arrow
                            >
                              <span>
                                <IconButton
                                  type="button"
                                  size="small"
                                  color={
                                    scenarioDetail?.commandEnabled
                                      ? "primary"
                                      : "default"
                                  }
                                  aria-label="커맨드에 추가"
                                  aria-pressed={
                                    !!scenarioDetail?.commandEnabled
                                  }
                                  disabled={
                                    loading ||
                                    commandSaving ||
                                    !scenarioDetail?.id ||
                                    !scenarioDetail.revision
                                  }
                                  onClick={async () => {
                                    const detail = scenarioDetail;
                                    if (
                                      !detail?.id ||
                                      !detail.revision ||
                                      commandSaving
                                    )
                                      return;
                                    setCommandSaving(true);
                                    setCommandError("");
                                    try {
                                      const saved = await toggleScenarioCommand(
                                        detail.id,
                                        !detail.commandEnabled,
                                        detail.revision,
                                      );
                                      setScenarioDetail((current) =>
                                        current?.id === saved.id
                                          ? { ...current, ...saved }
                                          : current,
                                      );
                                    } catch (error) {
                                      setCommandError(
                                        error instanceof Error
                                          ? error.message
                                          : "커맨드 등록을 저장하지 못했습니다.",
                                      );
                                    } finally {
                                      setCommandSaving(false);
                                    }
                                  }}
                                  sx={{
                                    border: 1,
                                    borderColor: "divider",
                                    borderRadius: 1,
                                  }}
                                >
                                  {scenarioDetail?.commandEnabled ? (
                                    <BookmarkIcon fontSize="small" />
                                  ) : (
                                    <BookmarkBorderIcon fontSize="small" />
                                  )}
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={t("View scenario versions")} arrow>
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={t("View scenario versions")}
                                  disabled={!scenarioDetail?.ltst_ver_id}
                                  onClick={() =>
                                    handleVersionViewScenario({
                                      ...scenario,
                                      ...scenarioDetail,
                                    })
                                  }
                                  sx={{
                                    border: 1,
                                    borderColor: "divider",
                                    borderRadius: 1,
                                  }}
                                >
                                  <BuildIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                            <Tooltip title={t("Flow edit")} arrow>
                              <span>
                                <IconButton
                                  size="small"
                                  color="primary"
                                  aria-label={t("Flow edit")}
                                  disabled={!scenarioDetail}
                                  onClick={() => {
                                    handleMoveTempScenario({
                                      ...scenario,
                                      ...scenarioDetail,
                                    });
                                  }}
                                  sx={{
                                    border: 1,
                                    borderColor: "divider",
                                    borderRadius: 1,
                                  }}
                                >
                                  <AppRegistrationIcon fontSize="small" />
                                </IconButton>
                              </span>
                            </Tooltip>
                          </Box>
                          {commandError && (
                            <Typography
                              role="alert"
                              color="error"
                              sx={{ gridColumn: "1 / -1" }}
                            >
                              {commandError}
                            </Typography>
                          )}
                        </Box>
                      </Box>
                    </Box>
                  )}

                  <Box
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 2,
                      p: 2,
                      ...{
                        borderRadius: 1,
                        backgroundColor: "background.paper",
                        color: "text.primary",
                        border: "1px solid",
                        borderColor: "var(--builder-border)",
                      },
                    }}
                  >
                    <Controller
                      name="name"
                      control={control}
                      render={({ field }) => (
                        <InputWithLabel
                          {...field}
                          fullWidth
                          label={`${t("Name")} *`}
                          size="medium"
                          placeholder={t(
                            "Please enter your search scenario name",
                          )}
                          sx={{ mb: 2 }}
                          onChange={(e: any) => {
                            field.onChange(e);
                          }}
                        />
                      )}
                    />
                    <Controller
                      name="description"
                      control={control}
                      render={({ field }) => (
                        <InputWithLabel
                          {...field}
                          multiline
                          fullWidth
                          label={t("Description")}
                          size="medium"
                          placeholder={t(
                            "Please enter your search scenario description",
                          )}
                          sx={{
                            mb: 2,
                            "& .MuiInputBase-inputMultiline": {
                              padding: 0,
                            },
                          }}
                          onChange={(e: any) => {
                            field.onChange(e);
                            handleDataChange("description", e.target.value);
                          }}
                        />
                      )}
                    />
                    <Controller
                      name="scenario_type"
                      control={control}
                      render={({ field }) => (
                        <ScenarioTypeSelector
                          value={field.value}
                          onChange={(value) => {
                            field.onChange(value);
                            handleDataChange("scenario_type", value);
                          }}
                        />
                      )}
                    />
                  </Box>
                </Box>

                {/* 하단 날짜 및 SAVE 버튼 영역 */}
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    p: 2,
                    borderTop: 1,
                    borderColor: "var(--builder-border)",
                    ...{
                      backgroundColor: "var(--builder-surface)",
                    },
                  }}
                >
                  {/* 좌측 날짜 */}
                  <Typography
                    sx={{ color: "text.secondary" }}
                    variant="caption"
                  >
                    {format(new Date(), "yyyy-MM-dd HH:mm:ss")}
                  </Typography>

                  {/* 우측 버튼 그룹 */}
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={handleSaveScenario}
                    >
                      {t("SAVE")}
                    </Button>

                    <Button
                      type="button"
                      variant="contained"
                      color="inherit"
                      onClick={handleCloseScenario}
                    >
                      {t("CLOSE")}
                    </Button>
                  </Box>
                </Box>
              </form>
            </Dialog>
            {/* // 2. 편집 화면 영역 끝 */}
          </Box>
        </Box>
      </Box>
      {/* // List와 Editor를 감싸는 수평 Flex 컨테이너 끝 */}
    </Box>
  );
};

export default ScenarioList;
