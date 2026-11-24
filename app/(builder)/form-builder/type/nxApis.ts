export type NxMethod = "get" | "post" | "put" | "delete" | "patch";

export interface NxApis {
  id: string;
  endPoint: string;
  method?: NxMethod;
  headers?: string;
  intentId?: string;
  intentTil?: string;
  buttonId?: string;
  description: string;
  buttonName?: string;
  uiID?: string;
  uiName?: string;
  dto?: string;
  dtoId?: string;
  useYn?: string;
  totalRows: number;
  dtoInfo?: {
    dto_in?: NxApiDtoField[];
    dto_out?: NxApiDtoField[];
  };
}

export interface NxApiDtoField {
  api_dto_fld_id?: string;
  api_dto_id?: string;
  api_dto_fld_nm?: string;
  api_dto_fld_type_cd?: string;
  api_dto_fld_data_tp_cd?: string;
  api_dto_fld_desc?: string;
  api_fld_ovrd_des?: string;
  name?: string;
  fieldName?: string;
  dataType?: string;
  type?: string;
  description?: string;
  desc?: string;
  enumValue?: string;
  enum_value?: string;
  enum_val?: string;
  children?: NxApiDtoField[];
  childFields?: NxApiDtoField[];
  dto_fields?: NxApiDtoField[];
  fields?: NxApiDtoField[];
}
