import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";
import { AppendResizeObserver } from "./Tools.ts";

export const GetMainViewContainer = () => document.querySelector<HTMLElement>(".Root__main-view");
export const GetLeftSidebarContainer = () => document.querySelector<HTMLElement>("#Desktop_LeftSidebar_Id");
export const GetNowPlayingViewContainer = () => document.querySelector<HTMLElement>(".Root__right-sidebar");

const GetWidth = (container: HTMLElement): number => {
    if (!container) return 0;
    return container.offsetWidth;
}

const observersSetup = new Set<HTMLElement>();

export const SetupObservers = () => {
    // console.log("SetupObservers: Initializing");
    // Main View
    {
        const container = GetMainViewContainer();
        if (!container) {
            console.error("SetupObservers: Main View container not found.");
            return 0;
        }
        if (observersSetup.has(container)) {
            console.warn("SetupObservers: Main View observer already exists.");
            return;
        }
        const signal = AppendResizeObserver(container);

        const callback = () => {
            const width = GetWidth(container);
            // console.log(`SetupObservers: Main View width set to ${width}px`);
            document.body.style.setProperty("--MainView-Width", `${width}px`);
        }

        GlobalMaid.Give(signal.Connect(callback));
        callback();
        observersSetup.add(container);
        // console.log("SetupObservers: Main View observer configured.");
    }

    // Left sidebar
    {
        const container = GetLeftSidebarContainer();
        if (!container) {
            console.error("SetupObservers: Left Sidebar container not found.");
            return 0;
        }
        if (observersSetup.has(container)) {
            console.warn("SetupObservers: Left Sidebar observer already exists.");
            return;
        }
        const signal = AppendResizeObserver(container);

        const callback = () => {
            const width = GetWidth(container);
            // console.log(`SetupObservers: Left Sidebar width set to ${width}px`);
            document.body.style.setProperty("--LeftSidebar-Width", `${width}px`);
        }

        GlobalMaid.Give(signal.Connect(callback));
        callback();
        observersSetup.add(container);
        // console.log("SetupObservers: Left Sidebar observer configured.");
    }

    // Now Playing View
    /* {
        const container = GetNowPlayingViewContainer();
        if (!container) {
            console.error("SetupObservers: Now Playing View container not found.");
            return 0;
        }
        if (observersSetup.has(container)) {
            console.warn("SetupObservers: Now Playing View observer already exists.");
            return;
        }
        const signal = AppendResizeObserver(container);

        const callback = () => {
            const width = GetWidth(container);
            // console.log(`SetupObservers: Now Playing View width set to ${width}px`);
            document.body.style.setProperty("--NowPlayingView-Width", `${width}px`);
        }

        GlobalMaid.Give(signal.Connect(callback));
        callback();
        observersSetup.add(container);
        // console.log("SetupObservers: Now Playing View observer configured.");
    } */
    // console.log("SetupObservers: Initialization complete.");
}