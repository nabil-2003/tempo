import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { colors } from '@/src/theme/colors';
export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export function AppIcon({ name, size = 24, color = colors.textSecondary }: { name: IconName; size?: number; color?: string }) {
  return <Ionicons name={name} size={size} color={color} />;
}
export function IconButton({ name, label, onPress, color, size = 24 }: { name: IconName; label: string; onPress: () => void; color?: string; size?: number }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><AppIcon name={name} color={color} size={size} /></Pressable>;
}
