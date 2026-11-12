import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors } from "@/src/theme/colors";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

function SettingRow({
  icon,
  title,
  subtitle,
  onPress,
  right,
}: {
  icon: IconName;
  title: string;
  subtitle?: string;
  onPress?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <Pressable
      style={styles.setting}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.settingIcon}>
        <Ionicons name={icon} size={20} color={colors.primary} />
      </View>
      <View style={styles.settingCopy}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle ? <Text style={styles.settingSubtitle}>{subtitle}</Text> : null}
      </View>
      {right ?? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.textSecondary}
        />
      )}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const [notifications, setNotifications] = useState(true);
  const [darkMode, setDarkMode] = useState(true);

  const comingSoon = () =>
    Alert.alert("Coming soon", "This feature is coming soon.");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            hitSlop={10}
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Ionicons name="chevron-back" size={25} color={colors.text} />
          </Pressable>
          <Text style={styles.heading}>Profile</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.profile}>
          <Image
            source={require("../../assets/images/avatar.jpeg")}
            style={styles.avatar}
          />
          <Text style={styles.name}>Tempo User</Text>
          <Text style={styles.email}>user@example.com</Text>
          <Pressable style={styles.editButton} onPress={comingSoon}>
            <Ionicons name="create-outline" size={17} color={colors.text} />
            <Text style={styles.editText}>Edit Profile</Text>
          </Pressable>
        </View>

        <View style={styles.premiumCard}>
          <View style={styles.premiumHeading}>
            <Ionicons name="diamond" size={24} color="#F8D67A" />
            <Text style={styles.premiumTitle}>Tempo Premium</Text>
          </View>
          <Text style={styles.premiumDescription}>
            Enjoy an ad-free experience and unlimited listening.
          </Text>
          <Pressable style={styles.premiumButton} onPress={comingSoon}>
            <Text style={styles.premiumButtonText}>Upgrade - $6 / 3 months</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Account</Text>
        <View style={styles.section}>
          <SettingRow
            icon="person-outline"
            title="Personal Information"
            onPress={comingSoon}
          />
          <SettingRow
            icon="diamond-outline"
            title="My Subscription"
            subtitle="Free Plan"
            onPress={comingSoon}
          />
          <SettingRow
            icon="musical-notes-outline"
            title="My Creations"
            onPress={comingSoon}
          />
        </View>

        <Text style={styles.sectionLabel}>Preferences</Text>
        <View style={styles.section}>
          <SettingRow
            icon="notifications-outline"
            title="Notifications"
            right={
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
          <SettingRow
            icon="moon-outline"
            title="Dark Mode"
            right={
              <Switch
                value={darkMode}
                onValueChange={setDarkMode}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.text}
              />
            }
          />
          <SettingRow
            icon="language-outline"
            title="Language"
            subtitle="English"
            onPress={comingSoon}
          />
        </View>

        <Text style={styles.sectionLabel}>Support</Text>
        <View style={styles.section}>
          <SettingRow
            icon="help-circle-outline"
            title="Help & Support"
            onPress={comingSoon}
          />
          <SettingRow
            icon="shield-checkmark-outline"
            title="Privacy Policy"
            onPress={comingSoon}
          />
          <SettingRow
            icon="information-circle-outline"
            title="About Tempo"
            subtitle="Version 1.0.0"
            onPress={comingSoon}
          />
        </View>

        <Pressable
          style={styles.logout}
          onPress={() =>
            Alert.alert("Log out", "Authentication is not configured yet.")
          }
        >
          <Ionicons name="log-out-outline" size={21} color="#FB7185" />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
        <Text style={styles.footer}>Made with love for music</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingBottom: 44 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 24,
  },
  backButton: { width: 40, height: 40, justifyContent: "center" },
  headerSpacer: { width: 40 },
  heading: { color: colors.text, fontSize: 22, fontWeight: "800" },
  profile: { alignItems: "center", marginBottom: 28 },
  avatar: { width: 88, height: 88, borderRadius: 44, marginBottom: 14 },
  name: { color: colors.text, fontSize: 23, fontWeight: "700" },
  email: { color: colors.textSecondary, fontSize: 14, marginTop: 5 },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: colors.surfaceLight,
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 24,
    marginTop: 17,
  },
  editText: { color: colors.text, fontSize: 13, fontWeight: "600" },
  premiumCard: {
    backgroundColor: "#28203F",
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 18,
    padding: 18,
    marginBottom: 26,
  },
  premiumHeading: { flexDirection: "row", alignItems: "center", gap: 10 },
  premiumTitle: { color: colors.text, fontSize: 19, fontWeight: "700" },
  premiumDescription: {
    color: "#C9C0DF",
    fontSize: 13,
    lineHeight: 20,
    marginTop: 12,
    marginBottom: 18,
  },
  premiumButton: {
    backgroundColor: colors.primary,
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: "center",
  },
  premiumButtonText: { color: "#151020", fontSize: 14, fontWeight: "800" },
  sectionLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    marginBottom: 10,
    marginLeft: 4,
    textTransform: "uppercase",
  },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    paddingHorizontal: 15,
    marginBottom: 24,
  },
  setting: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 15,
  },
  settingIcon: {
    width: 37,
    height: 37,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceLight,
  },
  settingCopy: { flex: 1 },
  settingTitle: { color: colors.text, fontSize: 14, fontWeight: "600" },
  settingSubtitle: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  logout: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 17,
    borderRadius: 15,
    backgroundColor: "#291B29",
  },
  logoutText: { color: "#FB7185", fontSize: 15, fontWeight: "700" },
  footer: {
    color: "#626276",
    fontSize: 12,
    textAlign: "center",
    marginTop: 28,
  },
});