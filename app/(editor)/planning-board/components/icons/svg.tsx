export type IconComponentProps = {
  size?: number;
  color?: string;
  className?: string;
};

function SvgIcon({
  children,
  size = 24,
  color = "currentColor",
  className,
}: IconComponentProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function HeartIcon(props: IconComponentProps) {
  return (
    <SvgIcon {...props}>
      <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z" />
    </SvgIcon>
  );
}

export function StarIcon(props: IconComponentProps) {
  return (
    <SvgIcon {...props}>
      <path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z" />
    </SvgIcon>
  );
}

export function BoltIcon(props: IconComponentProps) {
  return (
    <SvgIcon {...props}>
      <path d="M13 2 4.5 13H11l-1 9 8.5-12H12l1-8Z" />
    </SvgIcon>
  );
}

function PathIcon({ path, ...props }: IconComponentProps & { path: string }) {
  return (
    <SvgIcon {...props}>
      <path d={path} />
    </SvgIcon>
  );
}

export function HomeIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m3 11 9-8 9 8v9H6v-9M9 20v-6h6v6" />;
}
export function SearchIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M21 21l-4.4-4.4M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0Z"
    />
  );
}
export function UserIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M20 21a8 8 0 0 0-16 0M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
    />
  );
}
export function UsersIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"
    />
  );
}
export function SettingsIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.6v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"
    />
  );
}
export function MenuIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M4 6h16M4 12h16M4 18h16" />;
}
export function CloseIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 5l14 14M19 5 5 19" />;
}
export function PlusIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 5v14M5 12h14" />;
}
export function MinusIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 12h14" />;
}
export function CheckIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m4 12 5 5L20 6" />;
}
export function ChevronLeftIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m15 18-6-6 6-6" />;
}
export function ChevronRightIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m9 18 6-6-6-6" />;
}
export function ChevronUpIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m6 15 6-6 6 6" />;
}
export function ChevronDownIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m6 9 6 6 6-6" />;
}
export function ArrowLeftIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M20 12H4m6-6-6 6 6 6" />;
}
export function ArrowRightIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M4 12h16m-6-6 6 6-6 6" />;
}
export function ArrowUpIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 20V4m-6 6 6-6 6 6" />;
}
export function ArrowDownIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 4v16m6-6-6 6-6-6" />;
}
export function EditIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5Z"
    />
  );
}
export function TrashIcon(props: IconComponentProps) {
  return (
    <PathIcon {...props} path="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6" />
  );
}
export function DownloadIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 3v12m-5-5 5 5 5-5M5 21h14" />;
}
export function UploadIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 15V3m-5 5 5-5 5 5M5 21h14" />;
}
export function MailIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M3 5h18v14H3V5Zm0 1 9 7 9-7" />;
}
export function PhoneIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.4 19.4 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"
    />
  );
}
export function CalendarIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 3v4m14-4v4M3 9h18M4 5h16v16H4V5Z" />;
}
export function ClockIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 6v6l4 2"
    />
  );
}
export function BellIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
    />
  );
}
export function CameraIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M3 7h4l2-3h6l2 3h4v13H3V7Zm13 6a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
    />
  );
}
export function ImageIcon(props: IconComponentProps) {
  return (
    <PathIcon {...props} path="M3 4h18v16H3V4Zm0 13 5-5 4 4 3-3 6 6M8 9h.01" />
  );
}
export function LinkIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M10 13a5 5 0 0 0 7.1.1l2-2A5 5 0 0 0 12 4l-1.1 1.1M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"
    />
  );
}
export function LockIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 10h14v11H5V10Zm3 0V7a4 4 0 0 1 8 0v3" />;
}
export function UnlockIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 10h14v11H5V10Zm3 0V7a4 4 0 0 1 7-2.6" />;
}
export function EyeIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  );
}
export function EyeOffIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M3 3l18 18M10.6 6.2A10.5 10.5 0 0 1 12 6c6.5 0 10 6 10 6a17 17 0 0 1-3 3.7M6.6 6.6C3.5 8.4 2 12 2 12s3.5 6 10 6c1.3 0 2.5-.2 3.5-.7"
    />
  );
}
export function PlayIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="m8 5 11 7-11 7V5Z" />;
}
export function PauseIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M8 5v14M16 5v14" />;
}
export function RefreshIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M20 6v5h-5M4 18v-5h5m10.5-2A8 8 0 0 0 6 7l-2 4m.5 2A8 8 0 0 0 18 17l2-4"
    />
  );
}
export function FilterIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M3 4h18l-7 8v6l-4 2v-8L3 4Z" />;
}
export function MoreHorizontalIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M5 12h.01M12 12h.01M19 12h.01" />;
}
export function MoreVerticalIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M12 5h.01M12 12h.01M12 19h.01" />;
}
export function ShoppingCartIcon(props: IconComponentProps) {
  return (
    <PathIcon {...props} path="M3 3h2l2.5 12h10l3-8H6M9 21h.01M18 21h.01" />
  );
}
export function BookmarkIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M6 3h12v18l-6-4-6 4V3Z" />;
}
export function MapPinIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-5 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
    />
  );
}
export function InfoIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM12 11v6M12 7h.01"
    />
  );
}
export function AlertTriangleIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M10.3 3.7 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0ZM12 9v4M12 17h.01"
    />
  );
}
export function HelpCircleIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM9.1 9a3 3 0 1 1 5.8 1c0 2-3 2-3 4M12 18h.01"
    />
  );
}
export function CopyIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M8 8h13v13H8V8ZM3 16V3h13" />;
}
export function ShareIcon(props: IconComponentProps) {
  return (
    <PathIcon
      {...props}
      path="M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm12 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.6 10.5l6.8-4M8.6 13.5l6.8 4"
    />
  );
}
export function ExternalLinkIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M14 3h7v7M10 14 21 3M18 13v8H3V6h8" />;
}
export function FolderIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M3 5h7l2 2h9v13H3V5Z" />;
}
export function FileIcon(props: IconComponentProps) {
  return <PathIcon {...props} path="M6 2h9l5 5v15H6V2Zm9 0v6h5" />;
}

export const svgIcons = {
  HeartIcon,
  StarIcon,
  BoltIcon,
  HomeIcon,
  SearchIcon,
  UserIcon,
  UsersIcon,
  SettingsIcon,
  MenuIcon,
  CloseIcon,
  PlusIcon,
  MinusIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EditIcon,
  TrashIcon,
  DownloadIcon,
  UploadIcon,
  MailIcon,
  PhoneIcon,
  CalendarIcon,
  ClockIcon,
  BellIcon,
  CameraIcon,
  ImageIcon,
  LinkIcon,
  LockIcon,
  UnlockIcon,
  EyeIcon,
  EyeOffIcon,
  PlayIcon,
  PauseIcon,
  RefreshIcon,
  FilterIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  ShoppingCartIcon,
  BookmarkIcon,
  MapPinIcon,
  InfoIcon,
  AlertTriangleIcon,
  HelpCircleIcon,
  CopyIcon,
  ShareIcon,
  ExternalLinkIcon,
  FolderIcon,
  FileIcon,
};
export type SvgIconName = keyof typeof svgIcons;
