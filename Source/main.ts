import { ApplyKeyframes } from "./Tools/KeyframeProcessor.ts";
import { GetCoverArtForSong } from "./Tools/GetSongCoverArt.ts";
import { DynamicBackground } from "@spikerko/tools/DynamicBackground";
import TempoPlugin from "@spikerko/tools/TempoPlugin";
import './Stylings/main.scss'
import {
    GetSpotifyAccessToken,
	GlobalMaid,
	HistoryLocation,
	OnSpotifyReady,
    SpotifyHistory,
    SpotifyPlayer
} from "@spikerko/spices/Spicetify/Services/Session"
import {
    Song,
	SongChanged,
    Timestamp,
} from "@spikerko/spices/Spicetify/Services/Player"
import type { UpdateNoticeConfiguration } from "@spikerko/spices/AutoUpdate/UpdateNotice"
import Whentil, { type CancelableTask } from "@spikerko/tools/Whentil";
import { Maid } from "@socali/modules/Maid";
import { Timeout } from "@socali/modules/Scheduler";
import { BackgroundToggle, DeregisterBackgroundToggle, RegisterBackgroundToggle, GetToggleSignal } from "./Tools/BackgroundToggle.ts";
import { ApplyFluidGlassEffectToDOM } from "./Tools/FluidGlassEffect.ts";
import { GetMainViewContainer, SetupObservers } from "./Tools/MainView.ts";
// import GetArtistsProfilePicture from "./Tools/GetArtistsProfilePicture.ts";

// Constants for DynamicBackground configuration
const BG_CONFIG = {
    TRANSITION_DURATION: 0.5,  // Transition duration in seconds
    BLUR_AMOUNT: 75,            // Blur amount in pixels
    ROTATION_SPEED: 0.3,        // Rotation speed
    PLUGINS: [
        TempoPlugin({
            getAccessToken: async () => {
                const token = await GetSpotifyAccessToken();
                return `Bearer ${token}`
            },
            getPaused: () => {
                return !SpotifyPlayer.isPlaying();
            },
            getSongId: () => {
                return Song?.Uri.replace("spotify:track:", "") ?? "";
            },
            getSongPosition: () => {
                return Timestamp;
            },
            // deno-lint-ignore no-explicit-any
            SongChangeSignal: SongChanged as any
        })
    ]
};

// Configuration for Header Image scroll effects
const HEADER_IMAGE_EFFECT_CONFIG = {
    SCALE: {
        INITIAL_VALUE: 1.085,
        TARGET_VALUE: 1.00,
    },
    OPACITY: {
        INITIAL_VALUE: 1.0,
        TARGET_VALUE: 0.85,
    },
    BLUR: {
        INITIAL_VALUE: 0,  // px
        TARGET_VALUE: 0, // px (Derived from old 100 / DIVISOR)
    },
    SATURATION: {
        INITIAL_VALUE: 1,  // Assuming 1 is normal saturation (100%)
        TARGET_VALUE: 1, // Target saturation (e.g., 50%)
    },
    ROTATION: {
        INITIAL_VALUE: 0,  // degrees
        TARGET_VALUE: 0, // degrees
    },
    MASK_PERCENTAGE: {
        INITIAL_VALUE: 75,  // %
        TARGET_VALUE: 30, // %
    },
    BRIGHTNESS: {
        INITIAL_VALUE: 0.8, // Initial brightness
        TARGET_VALUE: 0.8, // Target brightness
    },
    HEIGHT: {
        INITIAL_VALUE: 40, // vh
        TARGET_VALUE: 0, // vh
    },
    SCROLL_INPUT: { // Defines how the base fadePercentage is calculated
        IMAGE_HEIGHT_MULTIPLIER: 0.8,
    }
};

// Define variables at module scope so they can be accessed by cleanup functions
let lastCoverArt: string | undefined = undefined;
let currentDBGMaid: Maid | undefined;
let currentBgElement: DynamicBackground | undefined = undefined;
let backgroundContainer: HTMLElement | undefined;

let ranBGPrefetch = false;

const ResetSpicyBGGlobalObject = () => {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).SpicyBG = {
        Pack: {
            Platform: {},
        },
    };
}

const AMOUNT_OF_PREFETCHES = 2;

const prefetchCovers = async () => {
    if (currentBgElement) {
        for (let i = 0; i <= (AMOUNT_OF_PREFETCHES - 1); i++) {
            const cover = SpotifyPlayer.data.nextItems?.[i]?.metadata?.image_large_url;
            if (!cover) return;
            await currentBgElement.PrefetchImage(cover);
        }
    }
}

OnSpotifyReady
.then(
    () => {
        ApplyKeyframes()
        ApplyFluidGlassEffectToDOM();
        ResetSpicyBGGlobalObject();
        const mainViewWhentil = Whentil.When(GetMainViewContainer, SetupObservers)
        GlobalMaid.Give(() => mainViewWhentil.Cancel());

        // Initialize the maid
        currentDBGMaid = GlobalMaid.Give(new Maid());

        const applyDynamicBg = () => {
            if (!BackgroundToggle.Enabled) return;
            const [CoverArt, placeholderHueShift] = GetCoverArtForSong();
            if (!CoverArt) throw new Error("Failed to get CoverArt");

            // If the cover art is the same, do nothing
            if (lastCoverArt === CoverArt && currentBgElement) return;

            try {
                // Create new Maid for the new background if needed
                if (!currentDBGMaid || currentDBGMaid.IsDestroyed()) {
                    currentDBGMaid = GlobalMaid.Give(new Maid());
                }

                const whentilListener = Whentil.When(
                    () => document.querySelector<HTMLElement>("#main .Root"),
                    async (Container) => {
                        if (!Container) return;

                        // Create background container if it doesn't exist
                        if (!backgroundContainer) {
                            backgroundContainer = document.createElement("div");
                            backgroundContainer.classList.add("SpicyBGContainer", "BackgroundContainer");
                            GlobalMaid.Give(backgroundContainer);
                            Container.appendChild(backgroundContainer);
                        }

                        try {
                            // If we have an existing background, try to update it
                            if (currentBgElement) {
                                // Update the existing background
                                await currentBgElement.Update({
                                    image: CoverArt,
                                    placeholderHueShift
                                });
                                lastCoverArt = CoverArt;
                                // deno-lint-ignore no-explicit-any
                                (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                    Instance: currentBgElement,
                                    LastState: {
                                        CoverArt: CoverArt,
                                        PlaceholderHueShift: placeholderHueShift
                                    }
                                }
                            } else {
                                // Create a new background
                                // Destroy the old one if it exists
                                if (currentBgElement) {
                                    try {
                                        (currentBgElement as unknown as { Destroy: () => void }).Destroy();
                                        // deno-lint-ignore no-explicit-any
                                        (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                            Instance: currentBgElement,
                                            LastState: {
                                                CoverArt: CoverArt,
                                                PlaceholderHueShift: placeholderHueShift
                                            }
                                        }
                                    } catch (error) {
                                        console.error("Failed to destroy background:", error);
                                    }
                                }

                                // Create new background with the current maid
                                currentBgElement = new DynamicBackground({
                                    transition: BG_CONFIG.TRANSITION_DURATION,
                                    blur: BG_CONFIG.BLUR_AMOUNT,
                                    maid: currentDBGMaid,
                                    speed: BG_CONFIG.ROTATION_SPEED,
                                    plugins: BG_CONFIG.PLUGINS
                                });

                                // Add the "BackgroundLayer" class
                                currentBgElement.GetCanvasElement().classList.add("SpicyBG", "BackgroundLayer");

                                // deno-lint-ignore no-explicit-any
                                (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                    Instance: currentBgElement,
                                    LastState: {
                                        CoverArt: CoverArt,
                                        PlaceholderHueShift: placeholderHueShift
                                    }
                                }

                                // Initialize with the current cover art
                                await currentBgElement.Update({
                                    image: CoverArt,
                                    placeholderHueShift
                                });

                                // Append to the background container
                                currentBgElement.AppendToElement(backgroundContainer);

                                // Update the last cover art
                                lastCoverArt = CoverArt;

                                // deno-lint-ignore no-explicit-any
                                (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                    Instance: currentBgElement,
                                    LastState: {
                                        CoverArt: CoverArt,
                                        PlaceholderHueShift: placeholderHueShift
                                    }
                                }
                            }
                        } catch (error) {
                            console.error("Failed to create/update dynamic background:", error);

                            // If update fails, create a new background
                            if (currentBgElement) {
                                try {
                                    (currentBgElement as unknown as { Destroy: () => void }).Destroy();
                                    // deno-lint-ignore no-explicit-any
                                    (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                        Instance: currentBgElement,
                                        LastState: {
                                            CoverArt: CoverArt,
                                            PlaceholderHueShift: placeholderHueShift
                                        }
                                    }
                                } catch (error) {
                                    console.error("Failed to destroy background:", error);
                                }
                                currentBgElement = undefined;
                                // deno-lint-ignore no-explicit-any
                                (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                    Instance: currentBgElement,
                                    LastState: {
                                        CoverArt: CoverArt,
                                        PlaceholderHueShift: placeholderHueShift
                                    }
                                }
                            }

                            // Create new Maid
                            if (currentDBGMaid) {
                                currentDBGMaid.Destroy();
                            }
                            currentDBGMaid = GlobalMaid.Give(new Maid());

                            // Create new background with the new maid
                            currentBgElement = new DynamicBackground({
                                transition: BG_CONFIG.TRANSITION_DURATION,
                                blur: BG_CONFIG.BLUR_AMOUNT,
                                maid: currentDBGMaid,
                                speed: BG_CONFIG.ROTATION_SPEED,
                                plugins: BG_CONFIG.PLUGINS
                            });

                            // Add the "BackgroundLayer" class
                            currentBgElement.GetCanvasElement().classList.add("BackgroundLayer");

                            // deno-lint-ignore no-explicit-any
                            (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                Instance: currentBgElement,
                                LastState: {
                                    CoverArt: CoverArt,
                                    PlaceholderHueShift: placeholderHueShift
                                }
                            }

                            // Initialize with the current cover art
                            await currentBgElement.Update({
                                image: CoverArt,
                                placeholderHueShift
                            });

                            // Append to the background container
                            currentBgElement.AppendToElement(backgroundContainer);

                            // Update the last cover art
                            lastCoverArt = CoverArt;

                            // deno-lint-ignore no-explicit-any
                            (globalThis as any).SpicyBG.Pack.Platform.Background = {
                                Instance: currentBgElement,
                                LastState: {
                                    CoverArt: CoverArt,
                                    PlaceholderHueShift: placeholderHueShift
                                }
                            }
                        }
                        
                        if (!ranBGPrefetch) {
                            prefetchCovers();
                            ranBGPrefetch = true;
                        }
                    }
                );

                currentDBGMaid.Give(() => {
                    whentilListener.Cancel();
                });

                // deno-lint-ignore no-explicit-any
                (globalThis as any).SpicyBG.Status = "injected";
            } catch (error) {
                console.error("Failed to apply dynamic background:", error);
            }
        };

        GlobalMaid.Give(SongChanged.Connect(applyDynamicBg));

        GlobalMaid.Give(SongChanged.Connect(prefetchCovers));

        const songWhentil = Whentil.When(() => Song, () => {
            applyDynamicBg();
        })

        GlobalMaid.Give(() => songWhentil?.Cancel())
        GlobalMaid.Give(() => {
            // deno-lint-ignore no-explicit-any
            if ((globalThis as any).SpicyBG) {
                // deno-lint-ignore no-explicit-any
                delete (globalThis as any).SpicyBG;
            }
        })

        const isLegacy = document.querySelector<HTMLElement>(".Root__main-view .os-host") ? true : false;
        
        {
            let scrollNodeWhentil: CancelableTask | undefined = undefined;
            let HeaderContentWhentil: CancelableTask | undefined = undefined;
            let UMVWhentil: CancelableTask | undefined = undefined;
            let bgImageWhentil: CancelableTask | undefined = undefined;
            let currentEventAbortController: AbortController | undefined = undefined;
            let hasBGImage: boolean = false;  // Track if current page has BGImage
            let NavigationMaid: Maid | undefined = undefined;

            let lastLocation: string | undefined = undefined;

            const historyListenerCallback = (event: HistoryLocation) => {
                if (lastLocation === event.pathname) return;
                lastLocation = event.pathname;

                if (NavigationMaid !== undefined) {
                    NavigationMaid.Destroy();
                    NavigationMaid = undefined;
                }

                NavigationMaid = GlobalMaid.Give(new Maid());

                // If we had a BGImage and we're navigating away, cleanup the controller
                if (hasBGImage && currentEventAbortController) {
                    currentEventAbortController.abort();
                    currentEventAbortController = undefined;
                }
                hasBGImage = false;  // Reset flag for new page

                const EventAbortController = new AbortController();
                currentEventAbortController = EventAbortController;
                
                scrollNodeWhentil = Whentil.When(() => isLegacy ? document.querySelector<HTMLElement>(`.main-view-container .main-view-container__scroll-node .os-viewport`) : document.querySelector<HTMLElement>(`.main-view-container .main-view-container__scroll-node [data-overlayscrollbars-viewport="scrollbarHidden overflowXHidden overflowYScroll"]`),
                (Element: HTMLElement | null) => {
                    if (!Element) return;
                    UMVWhentil = Whentil.When(() => document.querySelector<HTMLElement>(`.main-view-container .under-main-view`) ?? document.querySelector<HTMLElement>(`.main-view-container .before-scroll-node`),
                        (UMVElement: HTMLElement | null) => {
                            if (!UMVElement) return;
                            bgImageWhentil = Whentil.When(() => UMVElement.querySelector<HTMLElement>("div .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") ?? UMVElement.querySelector<HTMLElement>("div .main-entityHeader-background.main-entityHeader-gradient"),
                            (BGImage: HTMLElement | null) => {
                                if (!BGImage) return;
                                hasBGImage = true;  // Set flag when BGImage is found
                                HeaderContentWhentil = Whentil.When(() => document.querySelector<HTMLElement>(".main-view-container .main-entityHeader-container.main-entityHeader-withBackgroundImage"),
                                (HeaderContent: HTMLElement | null) => {
                                    if (!HeaderContent) return;
                                    if (!BackgroundToggle.Enabled) {
                                        BGImage.style.opacity = "1";
                                        BGImage.style.scale = "1";
                                        BGImage.style.removeProperty("--blur-strength");
                                        BGImage.style.removeProperty("--saturation-strength");
                                        BGImage.style.removeProperty("--rotation-strength");
                                        BGImage.style.removeProperty("--mask-percentage");
                                        BGImage.style.removeProperty("--brightness-strength");
                                        BGImage.style.removeProperty("--height");
                                    }

                                    if (BackgroundToggle.Enabled) {
                                        const ContentSpacing = HeaderContent.querySelector<HTMLElement>(".iWTIFTzhRZT0rCD0_gOK");
                                        const QueryContainer: HTMLElement | undefined = isLegacy ? HeaderContent : ContentSpacing as HTMLElement;
                                        if (!QueryContainer) return;
                                        const ExistingPfp = QueryContainer.querySelector<HTMLElement>(".main-entityHeader-imageContainer");
                                        if (ExistingPfp) {
                                            ExistingPfp.remove();
                                        }
                                    }

                                    const AddPfp = () => {
                                        return;
                                        /* if (HeaderContent.classList.contains("ProfilePictureApplied") || HeaderContent.classList.contains("ProfilePictureLoading")) return;
                                        const ContentSpacing = HeaderContent.querySelector<HTMLElement>(".iWTIFTzhRZT0rCD0_gOK");
                                        const ArtistId = (event.pathname.includes("/artist/") ? event.pathname.replace("/artist/", "") : undefined);
                                        if (ArtistId) {
                                            HeaderContent.classList.add("ProfilePictureLoading")
                                            GetArtistsProfilePicture(ArtistId)
                                                .then(ArtistProfilePicture => {
                                                    if (ArtistProfilePicture === undefined) {
                                                        return;
                                                    }
                                                    const QueryContainer: HTMLElement | undefined = isLegacy ? HeaderContent : ContentSpacing as HTMLElement;
                                                    if (!QueryContainer) return;
                                                    const ProfilePictureElement = document.createElement("div");
                                                    ProfilePictureElement.className = "main-entityHeader-imageContainer main-entityHeader-imageContainerNew"
                                                    ProfilePictureElement.draggable = false;
                                                    ProfilePictureElement.innerHTML = `
                                                        <div class="main-entityHeader-image" draggable="false">
                                                            <img 
                                                                aria-hidden="false" 
                                                                draggable="false" 
                                                                loading="lazy" 
                                                                src="${ArtistProfilePicture}" 
                                                                alt="" 
                                                                class="main-image-image main-entityHeader-image main-entityHeader-shadow main-entityHeader-circle main-image-loaded" 
                                                            >
                                                        </div>
                                                    `.trim()
                                                    GlobalMaid.Give(ProfilePictureElement);
                                                    QueryContainer.insertBefore(ProfilePictureElement, QueryContainer.lastChild);
                                                    HeaderContent.classList.add("ProfilePictureApplied");
                                                    HeaderContent.classList.remove("ProfilePictureLoading");
                                                })
                                                .catch((error) => {
                                                    console.error("Failed to get Artist Profile Picture", error, ArtistId);
                                                    HeaderContent.classList.remove("ProfilePictureApplied");
                                                    HeaderContent.classList.remove("ProfilePictureLoading");
                                                    ShowNotification(`SpicyBG: Failed to get Artist Profile Picture for ${ArtistId}. Please report this to the developer, as an issue on Github, or on my Discord: @spikerko`, "error", 5);
                                                })
                                            } else {
                                                HeaderContent.classList.remove("ProfilePictureLoading")
                                            } */
                                    }
                                    if (BackgroundToggle.Enabled) {
                                        AddPfp();
                                    }

                                    const applyScrollEffects = (currentScrollTop: number) => {
                                        const maxScroll = BGImage.offsetHeight * HEADER_IMAGE_EFFECT_CONFIG.SCROLL_INPUT.IMAGE_HEIGHT_MULTIPLIER;
                                        const scrollProgress = Math.max(0, Math.min(1, currentScrollTop / maxScroll));
                                    
                                        // Calculate Scale
                                        const scaleConfig = HEADER_IMAGE_EFFECT_CONFIG.SCALE;
                                        const scale = scaleConfig.INITIAL_VALUE + scrollProgress * (scaleConfig.TARGET_VALUE - scaleConfig.INITIAL_VALUE);
                                        BGImage.style.scale = scale.toString();
                                    
                                        // Calculate Opacity
                                        const opacityConfig = HEADER_IMAGE_EFFECT_CONFIG.OPACITY;
                                        const opacity = opacityConfig.INITIAL_VALUE + scrollProgress * (opacityConfig.TARGET_VALUE - opacityConfig.INITIAL_VALUE);
                                        BGImage.style.opacity = opacity.toString();
                                    
                                        // Calculate Blur
                                        const blurConfig = HEADER_IMAGE_EFFECT_CONFIG.BLUR;
                                        const blurValue = blurConfig.INITIAL_VALUE + scrollProgress * (blurConfig.TARGET_VALUE - blurConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--blur-strength", `${blurValue}px`);
                                    
                                        // Calculate Saturation
                                        const saturationConfig = HEADER_IMAGE_EFFECT_CONFIG.SATURATION;
                                        const saturationValue = saturationConfig.INITIAL_VALUE + scrollProgress * (saturationConfig.TARGET_VALUE - saturationConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--saturation-strength", saturationValue.toString());
                                    
                                        // Calculate Rotation
                                        const rotationConfig = HEADER_IMAGE_EFFECT_CONFIG.ROTATION;
                                        const rotationValue = rotationConfig.INITIAL_VALUE + scrollProgress * (rotationConfig.TARGET_VALUE - rotationConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--rotation-strength", `${rotationValue}deg`);
                                    
                                        // Calculate Mask Percentage
                                        const maskConfig = HEADER_IMAGE_EFFECT_CONFIG.MASK_PERCENTAGE;
                                        const maskValue = maskConfig.INITIAL_VALUE + scrollProgress * (maskConfig.TARGET_VALUE - maskConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--mask-percentage", `${maskValue}%`);
                                    
                                        // Calculate Brightness
                                        const brightnessConfig = HEADER_IMAGE_EFFECT_CONFIG.BRIGHTNESS;
                                        const brightnessValue = brightnessConfig.INITIAL_VALUE + scrollProgress * (brightnessConfig.TARGET_VALUE - brightnessConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--brightness-strength", brightnessValue.toString());
                                    
                                        // Calculate Height
                                        const heightConfig = HEADER_IMAGE_EFFECT_CONFIG.HEIGHT;
                                        const vhPixels = globalThis.innerHeight / 100;
                                        const scrolledVh = currentScrollTop / vhPixels;
                                        const heightValue = Math.max(heightConfig.TARGET_VALUE, heightConfig.INITIAL_VALUE - scrolledVh);
                                        BGImage.style.setProperty("--height", `${heightValue}vh`);
                                    };
                                    
                                    if (BackgroundToggle.Enabled) {
                                        applyScrollEffects(Element.scrollTop);
                                    }

                                    Element.addEventListener("scroll", () => {
                                        const QueryContainer: HTMLElement | undefined = HeaderContent;
                                        if (!QueryContainer) return;

                                        if (!BackgroundToggle.Enabled) {
                                            QueryContainer.classList.remove("ProfilePictureApplied");
                                            BGImage.style.opacity = "1";
                                            BGImage.style.scale = "1";
                                            BGImage.style.removeProperty("--blur-strength");
                                            BGImage.style.removeProperty("--saturation-strength");
                                            BGImage.style.removeProperty("--rotation-strength");
                                            BGImage.style.removeProperty("--mask-percentage");
                                            BGImage.style.removeProperty("--brightness-strength");
                                            BGImage.style.removeProperty("--height");
                                            return;
                                        }

                                        AddPfp();
                                        
                                        applyScrollEffects(Element.scrollTop);
                                    }, { signal: EventAbortController.signal });
                                })
                                NavigationMaid?.Give(() => HeaderContentWhentil?.Cancel());
                                GlobalMaid.Give(Timeout(40, () => HeaderContentWhentil?.Cancel()));
                            })
                            NavigationMaid?.Give(() => bgImageWhentil?.Cancel());
                            GlobalMaid.Give(Timeout(40, () => bgImageWhentil?.Cancel()));
                        }
                    )
                    NavigationMaid?.Give(() => UMVWhentil?.Cancel());
                    GlobalMaid.Give(Timeout(40, () => UMVWhentil?.Cancel()));
                })
                NavigationMaid?.Give(() => scrollNodeWhentil?.Cancel());
                GlobalMaid.Give(Timeout(40, () => scrollNodeWhentil?.Cancel()));
            };
            GlobalMaid.Give(SpotifyHistory.listen(historyListenerCallback));
            historyListenerCallback(SpotifyHistory.location);
            GlobalMaid.Give(() => scrollNodeWhentil?.Cancel())
            GlobalMaid.Give(() => UMVWhentil?.Cancel())
            GlobalMaid.Give(() => bgImageWhentil?.Cancel());
            GlobalMaid.Give(() => currentEventAbortController?.abort());
            GlobalMaid.Give(() => {
                const HeaderContent = document.querySelector<HTMLElement>(".main-view-container .main-entityHeader-container.main-entityHeader-withBackgroundImage")
                if (HeaderContent) {
                    HeaderContent.classList.remove("ScrolledPast");
                    HeaderContent.classList.remove("ProfilePictureApplied");
                    HeaderContent.classList.remove("ProfilePictureLoading");
                }
            })
            GlobalMaid.Give(GetToggleSignal().Connect(() => {
                ResetSpicyBGGlobalObject();
                if (!BackgroundToggle.Enabled) {
                    const HeaderContent = document.querySelector<HTMLElement>(".main-view-container .main-entityHeader-container.main-entityHeader-withBackgroundImage")
                    if (HeaderContent) {
                        HeaderContent.classList.remove("ScrolledPast");
                        HeaderContent.classList.remove("ProfilePictureApplied");
                        HeaderContent.classList.remove("ProfilePictureLoading");
                    }

                    const BGImage =
                        document.querySelector<HTMLElement>(".main-view-container .under-main-view .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") ??
                        document.querySelector<HTMLElement>(".main-view-container .before-scroll-node .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") ??
                        document.querySelector<HTMLElement>(".main-view-container .under-main-view .main-entityHeader-background.main-entityHeader-gradient") ??
                        document.querySelector<HTMLElement>(".main-view-container .before-scroll-node .main-entityHeader-background.main-entityHeader-gradient");
                    if (BGImage) {
                        BGImage.style.opacity = "1";
                        BGImage.style.scale = "1";
                        BGImage.style.removeProperty("--blur-strength");
                        BGImage.style.removeProperty("--saturation-strength");
                        BGImage.style.removeProperty("--rotation-strength");
                        BGImage.style.removeProperty("--mask-percentage");
                        BGImage.style.removeProperty("--brightness-strength");
                        BGImage.style.removeProperty("--height");
                    }

                    const ContentSpacing = HeaderContent?.querySelector<HTMLElement>(".iWTIFTzhRZT0rCD0_gOK");
                    const QueryContainer: HTMLElement | null = isLegacy ? HeaderContent : ContentSpacing as HTMLElement;
                    if (!QueryContainer) return;
                    const ExistingPfp = QueryContainer?.querySelector<HTMLElement>(".main-entityHeader-imageContainer");
                    if (ExistingPfp) {
                        ExistingPfp.remove();
                    }
                }
            }))
        }

        // Setup Menu Button
        {
            const OnButtonClick = () => {
                // Always clean up existing resources
                if (currentDBGMaid) {
                    currentDBGMaid.Destroy();
                    currentDBGMaid = undefined;
                }
                if (currentBgElement) {
                    currentBgElement.Destroy();
                    currentBgElement = undefined;
                }

                if (backgroundContainer) {
                    backgroundContainer.remove();
                    backgroundContainer = undefined;
                }

                GlobalMaid.Give(Timeout(0.1, () => {
                    // Apply the background if it's enabled
                    if (BackgroundToggle.Enabled) {
                        applyDynamicBg();
                    }
                }))
            };

            GlobalMaid.Give(GetToggleSignal().Connect(OnButtonClick))
            RegisterBackgroundToggle();
            GlobalMaid.Give(() => DeregisterBackgroundToggle());
        }
    }
)


export const UpdateNotice: UpdateNoticeConfiguration = {
	Type: "Notification",
	Name: "SpicyBG"
}

// Add a cleanup function to ensure proper disposal of Three.js resources when GlobalMaid.Destroy() is called
const cleanupThreeResources = () => {
    // This will trigger a complete cleanup of all Three.js resources
    if (currentDBGMaid) {
        currentDBGMaid.Destroy();
        currentDBGMaid = undefined;
    }
    if (currentBgElement) {
        currentBgElement.Destroy();
        currentBgElement = undefined;
    }
    if (backgroundContainer) {
        backgroundContainer = undefined;
    }

    // Reset state variables
    lastCoverArt = undefined;
};

GlobalMaid.Give(cleanupThreeResources);

export default GlobalMaid;
