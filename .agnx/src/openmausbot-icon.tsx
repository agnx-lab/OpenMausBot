// 场景：OpenMausBot 侧栏/命令图标 fallback — manifest.icon 指向 public/app-icon.svg。
import { MessagesSquare } from "lucide-react-native";

export function OpenMausBotIcon(props: {
  size?: number | string;
  color?: string;
  absoluteStrokeWidth?: boolean;
}) {
  return <MessagesSquare {...props} />;
}
