import { GlobalMaid, Spotify } from "@spikerko/spices/Spicetify/Services/Session";
import { Signal } from "@socali/modules/Signal";
import { Maid } from "@socali/modules/Maid";
import { GetSetting, SetSetting } from "./SettingsStore.ts";

export const BackgroundToggle = {
    Enabled: GetSetting("Enabled") ?? true,
    Registered: false
};

let ToggleMaid = GlobalMaid.Give(new Maid());
// Use let instead of const so we can reassign it
let ToggleSignal = new Signal();
// Export a function to get the current signal instead of the signal itself
export const GetToggleSignal = () => ToggleSignal;

// Add the signal to the maid for proper cleanup
GlobalMaid.Give(() => {
    if (ToggleSignal && !ToggleSignal.IsDestroyed()) {
        ToggleSignal.Destroy();
    }
});

export const RegisterBackgroundToggle = () => {
    if (BackgroundToggle.Registered) return;

    // Ensure we have a valid signal
    if (!ToggleSignal || ToggleSignal.IsDestroyed()) {
        ToggleSignal = new Signal();
    }

    const menu = new Spotify.Menu.Item(
        "SpicyBG",
        GetSetting("Enabled") ?? true,
        (self) => {
            // Toggle the enabled state
            const newState = !self.isEnabled;

            // Update the menu state
            self.setState(newState);
            SetSetting("Enabled", newState);

            // Update the BackgroundToggle state
            BackgroundToggle.Enabled = newState;

            // Check if signal is destroyed before firing
            if (ToggleSignal && !ToggleSignal.IsDestroyed()) {
                ToggleSignal.Fire();
            }
        },
        Spotify.SVGIcons.enhance
    );
    menu.register();
    ToggleMaid.Give(() => menu.deregister());
    BackgroundToggle.Registered = true;
};

export const DeregisterBackgroundToggle = () => {
    if (!BackgroundToggle.Registered) return;

    // Destroy the old maid
    if (ToggleMaid && !ToggleMaid.IsDestroyed()) {
        ToggleMaid.Destroy();
    }

    // Create a new maid
    ToggleMaid = GlobalMaid.Give(new Maid());

    // Destroy the old signal and create a new one
    if (ToggleSignal && !ToggleSignal.IsDestroyed()) {
        ToggleSignal.Destroy();
    }
    ToggleSignal = new Signal();

    BackgroundToggle.Registered = false;
};