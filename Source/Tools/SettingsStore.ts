import { GetInstantStore } from "@spikerko/spices/Spicetify/Services/Cache";

type Settings = {
    Enabled: boolean;
}

const SettingsStore = GetInstantStore<Settings>(
    "SpicyBG/Settings",
    1,
    { Enabled: true }
)

SettingsStore.SaveChanges();

export const GetSetting = (setting: keyof Settings): Settings[keyof Settings] | undefined => {
    return SettingsStore.Items[setting] ?? undefined;
}

export const SetSetting = (setting: keyof Settings, value: Settings[keyof Settings]) => {
    SettingsStore.Items[setting] = value;
    SettingsStore.SaveChanges();
}