import AccessTimeRounded from "@mui/icons-material/AccessTimeRounded";
import AddRounded from "@mui/icons-material/AddRounded";
import ArrowBackRounded from "@mui/icons-material/ArrowBackRounded";
import ArrowDownwardRounded from "@mui/icons-material/ArrowDownwardRounded";
import ArrowForwardRounded from "@mui/icons-material/ArrowForwardRounded";
import ArrowUpwardRounded from "@mui/icons-material/ArrowUpwardRounded";
import BookmarkRounded from "@mui/icons-material/BookmarkRounded";
import CalendarMonthRounded from "@mui/icons-material/CalendarMonthRounded";
import CheckRounded from "@mui/icons-material/CheckRounded";
import ChevronLeftRounded from "@mui/icons-material/ChevronLeftRounded";
import ChevronRightRounded from "@mui/icons-material/ChevronRightRounded";
import CloseRounded from "@mui/icons-material/CloseRounded";
import ContentCopyRounded from "@mui/icons-material/ContentCopyRounded";
import DeleteRounded from "@mui/icons-material/DeleteRounded";
import DescriptionRounded from "@mui/icons-material/DescriptionRounded";
import DownloadRounded from "@mui/icons-material/DownloadRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import EmailRounded from "@mui/icons-material/EmailRounded";
import ExpandLessRounded from "@mui/icons-material/ExpandLessRounded";
import ExpandMoreRounded from "@mui/icons-material/ExpandMoreRounded";
import FavoriteRounded from "@mui/icons-material/FavoriteRounded";
import FilterListRounded from "@mui/icons-material/FilterListRounded";
import FolderRounded from "@mui/icons-material/FolderRounded";
import GroupRounded from "@mui/icons-material/GroupRounded";
import HelpRounded from "@mui/icons-material/HelpRounded";
import HomeRounded from "@mui/icons-material/HomeRounded";
import ImageRounded from "@mui/icons-material/ImageRounded";
import InfoRounded from "@mui/icons-material/InfoRounded";
import LinkRounded from "@mui/icons-material/LinkRounded";
import LocationOnRounded from "@mui/icons-material/LocationOnRounded";
import LockOpenRounded from "@mui/icons-material/LockOpenRounded";
import LockRounded from "@mui/icons-material/LockRounded";
import MenuRounded from "@mui/icons-material/MenuRounded";
import MoreHorizRounded from "@mui/icons-material/MoreHorizRounded";
import MoreVertRounded from "@mui/icons-material/MoreVertRounded";
import NotificationsRounded from "@mui/icons-material/NotificationsRounded";
import OpenInNewRounded from "@mui/icons-material/OpenInNewRounded";
import PauseRounded from "@mui/icons-material/PauseRounded";
import PersonRounded from "@mui/icons-material/PersonRounded";
import PhoneRounded from "@mui/icons-material/PhoneRounded";
import PhotoCameraRounded from "@mui/icons-material/PhotoCameraRounded";
import PlayArrowRounded from "@mui/icons-material/PlayArrowRounded";
import RefreshRounded from "@mui/icons-material/RefreshRounded";
import RemoveRounded from "@mui/icons-material/RemoveRounded";
import SearchRounded from "@mui/icons-material/SearchRounded";
import SettingsRounded from "@mui/icons-material/SettingsRounded";
import ShareRounded from "@mui/icons-material/ShareRounded";
import ShoppingCartRounded from "@mui/icons-material/ShoppingCartRounded";
import StarRounded from "@mui/icons-material/StarRounded";
import UploadRounded from "@mui/icons-material/UploadRounded";
import VisibilityOffRounded from "@mui/icons-material/VisibilityOffRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import WarningAmberRounded from "@mui/icons-material/WarningAmberRounded";
import type { IconComponentProps } from "./svg";

function muiIconProps({ size = 24, color, className }: IconComponentProps) {
  return { sx: { fontSize: size, color }, className };
}

export function HomeIcon(props: IconComponentProps) {
  return <HomeRounded {...muiIconProps(props)} />;
}
export function FavoriteIcon(props: IconComponentProps) {
  return <FavoriteRounded {...muiIconProps(props)} />;
}
export function SettingsIcon(props: IconComponentProps) {
  return <SettingsRounded {...muiIconProps(props)} />;
}
export function SearchIcon(props: IconComponentProps) {
  return <SearchRounded {...muiIconProps(props)} />;
}
export function PersonIcon(props: IconComponentProps) {
  return <PersonRounded {...muiIconProps(props)} />;
}
export function GroupIcon(props: IconComponentProps) {
  return <GroupRounded {...muiIconProps(props)} />;
}
export function MenuIcon(props: IconComponentProps) {
  return <MenuRounded {...muiIconProps(props)} />;
}
export function CloseIcon(props: IconComponentProps) {
  return <CloseRounded {...muiIconProps(props)} />;
}
export function AddIcon(props: IconComponentProps) {
  return <AddRounded {...muiIconProps(props)} />;
}
export function RemoveIcon(props: IconComponentProps) {
  return <RemoveRounded {...muiIconProps(props)} />;
}
export function CheckIcon(props: IconComponentProps) {
  return <CheckRounded {...muiIconProps(props)} />;
}
export function ChevronLeftIcon(props: IconComponentProps) {
  return <ChevronLeftRounded {...muiIconProps(props)} />;
}
export function ChevronRightIcon(props: IconComponentProps) {
  return <ChevronRightRounded {...muiIconProps(props)} />;
}
export function ChevronUpIcon(props: IconComponentProps) {
  return <ExpandLessRounded {...muiIconProps(props)} />;
}
export function ChevronDownIcon(props: IconComponentProps) {
  return <ExpandMoreRounded {...muiIconProps(props)} />;
}
export function ArrowBackIcon(props: IconComponentProps) {
  return <ArrowBackRounded {...muiIconProps(props)} />;
}
export function ArrowForwardIcon(props: IconComponentProps) {
  return <ArrowForwardRounded {...muiIconProps(props)} />;
}
export function ArrowUpIcon(props: IconComponentProps) {
  return <ArrowUpwardRounded {...muiIconProps(props)} />;
}
export function ArrowDownIcon(props: IconComponentProps) {
  return <ArrowDownwardRounded {...muiIconProps(props)} />;
}
export function EditIcon(props: IconComponentProps) {
  return <EditRounded {...muiIconProps(props)} />;
}
export function DeleteIcon(props: IconComponentProps) {
  return <DeleteRounded {...muiIconProps(props)} />;
}
export function DownloadIcon(props: IconComponentProps) {
  return <DownloadRounded {...muiIconProps(props)} />;
}
export function UploadIcon(props: IconComponentProps) {
  return <UploadRounded {...muiIconProps(props)} />;
}
export function EmailIcon(props: IconComponentProps) {
  return <EmailRounded {...muiIconProps(props)} />;
}
export function PhoneIcon(props: IconComponentProps) {
  return <PhoneRounded {...muiIconProps(props)} />;
}
export function CalendarIcon(props: IconComponentProps) {
  return <CalendarMonthRounded {...muiIconProps(props)} />;
}
export function ClockIcon(props: IconComponentProps) {
  return <AccessTimeRounded {...muiIconProps(props)} />;
}
export function NotificationsIcon(props: IconComponentProps) {
  return <NotificationsRounded {...muiIconProps(props)} />;
}
export function CameraIcon(props: IconComponentProps) {
  return <PhotoCameraRounded {...muiIconProps(props)} />;
}
export function ImageIcon(props: IconComponentProps) {
  return <ImageRounded {...muiIconProps(props)} />;
}
export function LinkIcon(props: IconComponentProps) {
  return <LinkRounded {...muiIconProps(props)} />;
}
export function LockIcon(props: IconComponentProps) {
  return <LockRounded {...muiIconProps(props)} />;
}
export function UnlockIcon(props: IconComponentProps) {
  return <LockOpenRounded {...muiIconProps(props)} />;
}
export function VisibilityIcon(props: IconComponentProps) {
  return <VisibilityRounded {...muiIconProps(props)} />;
}
export function VisibilityOffIcon(props: IconComponentProps) {
  return <VisibilityOffRounded {...muiIconProps(props)} />;
}
export function PlayIcon(props: IconComponentProps) {
  return <PlayArrowRounded {...muiIconProps(props)} />;
}
export function PauseIcon(props: IconComponentProps) {
  return <PauseRounded {...muiIconProps(props)} />;
}
export function RefreshIcon(props: IconComponentProps) {
  return <RefreshRounded {...muiIconProps(props)} />;
}
export function FilterIcon(props: IconComponentProps) {
  return <FilterListRounded {...muiIconProps(props)} />;
}
export function MoreHorizontalIcon(props: IconComponentProps) {
  return <MoreHorizRounded {...muiIconProps(props)} />;
}
export function MoreVerticalIcon(props: IconComponentProps) {
  return <MoreVertRounded {...muiIconProps(props)} />;
}
export function ShoppingCartIcon(props: IconComponentProps) {
  return <ShoppingCartRounded {...muiIconProps(props)} />;
}
export function BookmarkIcon(props: IconComponentProps) {
  return <BookmarkRounded {...muiIconProps(props)} />;
}
export function LocationIcon(props: IconComponentProps) {
  return <LocationOnRounded {...muiIconProps(props)} />;
}
export function InfoIcon(props: IconComponentProps) {
  return <InfoRounded {...muiIconProps(props)} />;
}
export function WarningIcon(props: IconComponentProps) {
  return <WarningAmberRounded {...muiIconProps(props)} />;
}
export function HelpIcon(props: IconComponentProps) {
  return <HelpRounded {...muiIconProps(props)} />;
}
export function CopyIcon(props: IconComponentProps) {
  return <ContentCopyRounded {...muiIconProps(props)} />;
}
export function ShareIcon(props: IconComponentProps) {
  return <ShareRounded {...muiIconProps(props)} />;
}
export function ExternalLinkIcon(props: IconComponentProps) {
  return <OpenInNewRounded {...muiIconProps(props)} />;
}
export function FolderIcon(props: IconComponentProps) {
  return <FolderRounded {...muiIconProps(props)} />;
}
export function FileIcon(props: IconComponentProps) {
  return <DescriptionRounded {...muiIconProps(props)} />;
}
export function StarIcon(props: IconComponentProps) {
  return <StarRounded {...muiIconProps(props)} />;
}

export const muiIcons = {
  HomeIcon,
  FavoriteIcon,
  SettingsIcon,
  SearchIcon,
  PersonIcon,
  GroupIcon,
  MenuIcon,
  CloseIcon,
  AddIcon,
  RemoveIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  ArrowBackIcon,
  ArrowForwardIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  EditIcon,
  DeleteIcon,
  DownloadIcon,
  UploadIcon,
  EmailIcon,
  PhoneIcon,
  CalendarIcon,
  ClockIcon,
  NotificationsIcon,
  CameraIcon,
  ImageIcon,
  LinkIcon,
  LockIcon,
  UnlockIcon,
  VisibilityIcon,
  VisibilityOffIcon,
  PlayIcon,
  PauseIcon,
  RefreshIcon,
  FilterIcon,
  MoreHorizontalIcon,
  MoreVerticalIcon,
  ShoppingCartIcon,
  BookmarkIcon,
  LocationIcon,
  InfoIcon,
  WarningIcon,
  HelpIcon,
  CopyIcon,
  ShareIcon,
  ExternalLinkIcon,
  FolderIcon,
  FileIcon,
  StarIcon,
};
export type MuiIconName = keyof typeof muiIcons;
