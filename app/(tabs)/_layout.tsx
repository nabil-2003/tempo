import { AppIcon } from "@/src/components/AppIcon";
import { Tabs } from "expo-router";
import { StyleSheet } from "react-native";

import { colors } from "@/src/theme/colors";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: styles.label,
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color }) => (
            <AppIcon name="home-outline" color={typeof color === "string" ? color : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: "Search",
          tabBarIcon: ({ color }) => (
            <AppIcon name="search-outline" color={typeof color === "string" ? color : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="two"
        options={{
          title: "Library",
          tabBarIcon: ({ color }) => (
            <AppIcon name="library-outline" color={typeof color === "string" ? color : colors.textSecondary} />
          ),
        }}
      />
      <Tabs.Screen
        name="downloads"
        options={{
          title: "Downloads",
          tabBarIcon: ({ color }) => (
            <AppIcon name="download-outline" color={typeof color === "string" ? color : colors.textSecondary} />
          ),
        }}
      />

    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.background,
    borderTopColor: colors.border,
    height: 82,
    paddingTop: 8,
  },
  label: { fontSize: 11, fontWeight: "600" },
});
