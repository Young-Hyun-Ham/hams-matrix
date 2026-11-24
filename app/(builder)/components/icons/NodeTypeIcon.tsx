import {
  AppWindow,
  Bot,
  Boxes,
  Braces,
  ClipboardList,
  GitFork,
  Link,
  LogIn,
  MessageSquare,
  Settings,
  type LucideIcon,
  type LucideProps,
} from "lucide-react";

const nodeIcons: Record<string, LucideIcon> = {
  message: MessageSquare,
  form: ClipboardList,
  branch: GitFork,
  link: Link,
  setSlot: LogIn,
  api: Braces,
  iframe: AppWindow,
  scenarioGroup: Bot,
  scenario: Bot,
  settingNodes: Settings,
};

export default function NodeTypeIcon({
  type,
  size = 16,
  ...props
}: LucideProps & { type: string }) {
  const Icon = nodeIcons[type] || Boxes;
  return <Icon size={size} {...props} />;
}
