import ApiSettingsTabFields, {
  type ApiSettingsTabProps,
} from "./ApiSettingsTabFields";

function BindApiSettingsTab(props: ApiSettingsTabProps) {
  return <ApiSettingsTabFields {...props} />;
}

export default BindApiSettingsTab;
