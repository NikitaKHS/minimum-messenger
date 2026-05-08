import { darkColors, lightColors, spacing, radius, font, type ThemeColors } from '../theme';
import { useSettingsStore } from '../store/settings';

export interface AppTheme {
  colors: ThemeColors;
  isDark: boolean;
  spacing: typeof spacing;
  radius: typeof radius;
  font: typeof font;
}

export function useTheme(): AppTheme {
  const isDark = useSettingsStore((s) => s.isDark);
  return {
    colors: isDark ? darkColors : lightColors,
    isDark,
    spacing,
    radius,
    font,
  };
}
