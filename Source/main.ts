import { GetCoverArtForSong } from "./Tools/GetSongCoverArt.ts";
import { DynamicBackground } from "@spikerko/tools/DynamicBackground";
import './Stylings/main.scss'
import {
	GlobalMaid,
	HistoryLocation,
	OnSpotifyReady,
    ShowNotification,
    SpotifyHistory
} from "@spikerko/spices/Spicetify/Services/Session"
import {
    Song,
	SongChanged,
} from "@spikerko/spices/Spicetify/Services/Player"
import type { UpdateNoticeConfiguration } from "@spikerko/spices/AutoUpdate/UpdateNotice"
import Whentil, { type CancelableTask } from "@spikerko/tools/Whentil";
import { Maid } from "@socali/modules/Maid";
import { Timeout } from "@socali/modules/Scheduler";
import { BackgroundToggle, DeregisterBackgroundToggle, RegisterBackgroundToggle, GetToggleSignal } from "./Tools/BackgroundToggle.ts";
import GetArtistsProfilePicture from "./Tools/GetArtistsProfilePicture.ts";

// Constants for DynamicBackground configuration
const BG_CONFIG = {
    TRANSITION_DURATION: 0.15,  // Transition duration in seconds
    BLUR_AMOUNT: 50,            // Blur amount in pixels
    ROTATION_SPEED: 0.2         // Rotation speed
};

// Configuration for Header Image scroll effects
const HEADER_IMAGE_EFFECT_CONFIG = {
    SCALE: {
        INITIAL_VALUE: 1.025,
        TARGET_VALUE: 1.00,
        SCROLL_PERCENTAGE_START: 0,
        SCROLL_PERCENTAGE_END: 100,
    },
    OPACITY: {
        INITIAL_VALUE: 1.0,
        TARGET_VALUE: 0.6,
        SCROLL_PERCENTAGE_START: 0,
        SCROLL_PERCENTAGE_END: 100,
        SCROLLED_PAST_THRESHOLD: 0.65, // Opacity value at which "ScrolledPast" class is applied
    },
    BLUR: {
        INITIAL_VALUE: 0,  // px
        TARGET_VALUE: 20, // px (Derived from old 100 / DIVISOR)
        SCROLL_PERCENTAGE_START: 0,
        SCROLL_PERCENTAGE_END: 100,
    },
    SATURATION: {
        INITIAL_VALUE: 1,  // Assuming 1 is normal saturation (100%)
        TARGET_VALUE: 1.05, // Target saturation (e.g., 50%)
        SCROLL_PERCENTAGE_START: 0,
        SCROLL_PERCENTAGE_END: 100,
    },
    SCROLL_INPUT: { // Defines how the base fadePercentage is calculated
        IMAGE_HEIGHT_MULTIPLIER: 0.8,
        FADE_MULTIPLIER: 3.85,
    }
};

// Define variables at module scope so they can be accessed by cleanup functions
let lastCoverArt: string | undefined = undefined;
let currentDBGMaid: Maid | undefined;
let currentBgElement: DynamicBackground | undefined = undefined;
let backgroundContainer: HTMLElement | undefined;


const ResetSpicyBGGlobalObject = () => {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).SpicyBG = {
        Pack: {
            Platform: {},
        },
    };
}

OnSpotifyReady
.then(
    () => {
        ResetSpicyBGGlobalObject();
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
                                    speed: BG_CONFIG.ROTATION_SPEED
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
                                speed: BG_CONFIG.ROTATION_SPEED
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
                console.log("Navigated!", event.pathname)
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
                    UMVWhentil = Whentil.When(() => document.querySelector<HTMLElement>(`.main-view-container .under-main-view`),
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
                                        HeaderContent.classList.remove("ScrolledPast");
                                        HeaderContent.classList.remove("ProfilePictureApplied");
                                        BGImage.style.opacity = "1";
                                        BGImage.style.scale = "1";
                                        BGImage.style.removeProperty("--blur-strength");
                                        BGImage.style.removeProperty("--saturation-strength");
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
                                        if (HeaderContent.classList.contains("ProfilePictureApplied") || HeaderContent.classList.contains("ProfilePictureLoading")) return;
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
                                            }
                                    }
                                    if (BackgroundToggle.Enabled) {
                                        AddPfp();
                                    }

                                    // Set initial opacity based on scroll position
                                    const scrollTop = Element.scrollTop;

                                    // Calculate the maximum scroll value where the image should be fully transparent
                                    const maxScrollForFullTransparent = BGImage.offsetHeight * HEADER_IMAGE_EFFECT_CONFIG.SCROLL_INPUT.IMAGE_HEIGHT_MULTIPLIER;
                                    // Clip multiplier to make the fading more aggressive
                                    const fadeMultiplier = HEADER_IMAGE_EFFECT_CONFIG.SCROLL_INPUT.FADE_MULTIPLIER;

                                    // Calculate base fade percentage (0-100)
                                    const fadePercentage = Math.min(100, Math.max(0, (scrollTop / maxScrollForFullTransparent) * 100 * fadeMultiplier));

                                    // Calculate Opacity
                                    const opacityConfig = HEADER_IMAGE_EFFECT_CONFIG.OPACITY;
                                    let opacityEffectProgress = 0;
                                    if (fadePercentage >= opacityConfig.SCROLL_PERCENTAGE_END) {
                                        opacityEffectProgress = 1;
                                    } else if (fadePercentage > opacityConfig.SCROLL_PERCENTAGE_START) {
                                        const activeRange = opacityConfig.SCROLL_PERCENTAGE_END - opacityConfig.SCROLL_PERCENTAGE_START;
                                        if (activeRange > 0) {
                                            opacityEffectProgress = (fadePercentage - opacityConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                        }
                                    }
                                    opacityEffectProgress = Math.max(0, Math.min(1, opacityEffectProgress));
                                    const opacity = opacityConfig.INITIAL_VALUE + opacityEffectProgress * (opacityConfig.TARGET_VALUE - opacityConfig.INITIAL_VALUE);
                                    BGImage.style.opacity = opacity.toString();

                                    if (HeaderContent && opacity <= opacityConfig.SCROLLED_PAST_THRESHOLD) {
                                        if (BackgroundToggle.Enabled) {
                                            HeaderContent.classList.add("ScrolledPast")
                                        }
                                    } else {
                                        if (BackgroundToggle.Enabled) {
                                            HeaderContent?.classList.remove("ScrolledPast")
                                        }
                                    }

                                    // Calculate Scale
                                    const scaleConfig = HEADER_IMAGE_EFFECT_CONFIG.SCALE;
                                    let scaleEffectProgress = 0;
                                    if (fadePercentage >= scaleConfig.SCROLL_PERCENTAGE_END) {
                                        scaleEffectProgress = 1;
                                    } else if (fadePercentage > scaleConfig.SCROLL_PERCENTAGE_START) {
                                        const activeRange = scaleConfig.SCROLL_PERCENTAGE_END - scaleConfig.SCROLL_PERCENTAGE_START;
                                        if (activeRange > 0) {
                                            scaleEffectProgress = (fadePercentage - scaleConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                        }
                                    }
                                    scaleEffectProgress = Math.max(0, Math.min(1, scaleEffectProgress));
                                    const scale = scaleConfig.INITIAL_VALUE + scaleEffectProgress * (scaleConfig.TARGET_VALUE - scaleConfig.INITIAL_VALUE);
                                    if (BackgroundToggle.Enabled) {
                                        BGImage.style.scale = scale.toString();
                                    }

                                    // Calculate Blur
                                    const blurConfig = HEADER_IMAGE_EFFECT_CONFIG.BLUR;
                                    let blurEffectProgress = 0;
                                    if (fadePercentage >= blurConfig.SCROLL_PERCENTAGE_END) {
                                        blurEffectProgress = 1;
                                    } else if (fadePercentage > blurConfig.SCROLL_PERCENTAGE_START) {
                                        const activeRange = blurConfig.SCROLL_PERCENTAGE_END - blurConfig.SCROLL_PERCENTAGE_START;
                                        if (activeRange > 0) {
                                            blurEffectProgress = (fadePercentage - blurConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                        }
                                    }
                                    blurEffectProgress = Math.max(0, Math.min(1, blurEffectProgress));
                                    const blurValue = blurConfig.INITIAL_VALUE + blurEffectProgress * (blurConfig.TARGET_VALUE - blurConfig.INITIAL_VALUE);
                                    if (BackgroundToggle.Enabled) {
                                        BGImage.style.setProperty("--blur-strength", `${blurValue}px`);
                                    } else {
                                        BGImage.style.removeProperty("--blur-strength");
                                    }

                                    // Calculate Saturation
                                    const saturationConfig = HEADER_IMAGE_EFFECT_CONFIG.SATURATION;
                                    let saturationEffectProgress = 0;
                                    if (fadePercentage >= saturationConfig.SCROLL_PERCENTAGE_END) {
                                        saturationEffectProgress = 1;
                                    } else if (fadePercentage > saturationConfig.SCROLL_PERCENTAGE_START) {
                                        const activeRange = saturationConfig.SCROLL_PERCENTAGE_END - saturationConfig.SCROLL_PERCENTAGE_START;
                                        if (activeRange > 0) {
                                            saturationEffectProgress = (fadePercentage - saturationConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                        }
                                    }
                                    saturationEffectProgress = Math.max(0, Math.min(1, saturationEffectProgress));
                                    const saturationValue = saturationConfig.INITIAL_VALUE + saturationEffectProgress * (saturationConfig.TARGET_VALUE - saturationConfig.INITIAL_VALUE);
                                    if (BackgroundToggle.Enabled) {
                                        BGImage.style.setProperty("--saturation-strength", saturationValue.toString());
                                    } else {
                                        BGImage.style.removeProperty("--saturation-strength");
                                    }

                                    Element.addEventListener("scroll", () => {
                                        const QueryContainer: HTMLElement | undefined = HeaderContent;
                                        if (!QueryContainer) return;

                                        if (!BackgroundToggle.Enabled) {
                                            QueryContainer.classList.remove("ScrolledPast");
                                            QueryContainer.classList.remove("ProfilePictureApplied");
                                            BGImage.style.opacity = "1";
                                            BGImage.style.scale = "1";
                                            BGImage.style.removeProperty("--blur-strength");
                                            BGImage.style.removeProperty("--saturation-strength");
                                            return;
                                        }

                                        AddPfp();
                                        
                                        const scrollTop = Element.scrollTop;

                                        // Calculate base fade percentage (0-100)
                                        const fadePercentage = Math.min(100, Math.max(0, (scrollTop / maxScrollForFullTransparent) * 100 * fadeMultiplier));

                                        // Calculate Opacity
                                        const opacityConfig = HEADER_IMAGE_EFFECT_CONFIG.OPACITY;
                                        let opacityEffectProgress = 0;
                                        if (fadePercentage >= opacityConfig.SCROLL_PERCENTAGE_END) {
                                            opacityEffectProgress = 1;
                                        } else if (fadePercentage > opacityConfig.SCROLL_PERCENTAGE_START) {
                                            const activeRange = opacityConfig.SCROLL_PERCENTAGE_END - opacityConfig.SCROLL_PERCENTAGE_START;
                                            if (activeRange > 0) {
                                                opacityEffectProgress = (fadePercentage - opacityConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                            }
                                        }
                                        opacityEffectProgress = Math.max(0, Math.min(1, opacityEffectProgress));
                                        const opacity = opacityConfig.INITIAL_VALUE + opacityEffectProgress * (opacityConfig.TARGET_VALUE - opacityConfig.INITIAL_VALUE);
                                        BGImage.style.opacity = opacity.toString();

                                        if (QueryContainer && opacity <= opacityConfig.SCROLLED_PAST_THRESHOLD) {
                                            QueryContainer.classList.add("ScrolledPast")
                                        } else {
                                            QueryContainer?.classList.remove("ScrolledPast")
                                        }

                                        // Calculate Scale
                                        const scaleConfig = HEADER_IMAGE_EFFECT_CONFIG.SCALE;
                                        let scaleEffectProgress = 0;
                                        if (fadePercentage >= scaleConfig.SCROLL_PERCENTAGE_END) {
                                            scaleEffectProgress = 1;
                                        } else if (fadePercentage > scaleConfig.SCROLL_PERCENTAGE_START) {
                                            const activeRange = scaleConfig.SCROLL_PERCENTAGE_END - scaleConfig.SCROLL_PERCENTAGE_START;
                                            if (activeRange > 0) {
                                                scaleEffectProgress = (fadePercentage - scaleConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                            }
                                        }
                                        scaleEffectProgress = Math.max(0, Math.min(1, scaleEffectProgress));
                                        const scale = scaleConfig.INITIAL_VALUE + scaleEffectProgress * (scaleConfig.TARGET_VALUE - scaleConfig.INITIAL_VALUE);
                                        BGImage.style.scale = scale.toString();

                                        // Calculate Blur
                                        const blurConfig = HEADER_IMAGE_EFFECT_CONFIG.BLUR;
                                        let blurEffectProgress = 0;
                                        if (fadePercentage >= blurConfig.SCROLL_PERCENTAGE_END) {
                                            blurEffectProgress = 1;
                                        } else if (fadePercentage > blurConfig.SCROLL_PERCENTAGE_START) {
                                            const activeRange = blurConfig.SCROLL_PERCENTAGE_END - blurConfig.SCROLL_PERCENTAGE_START;
                                            if (activeRange > 0) {
                                                blurEffectProgress = (fadePercentage - blurConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                            }
                                        }
                                        blurEffectProgress = Math.max(0, Math.min(1, blurEffectProgress));
                                        const blurValue = blurConfig.INITIAL_VALUE + blurEffectProgress * (blurConfig.TARGET_VALUE - blurConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--blur-strength", `${blurValue}px`);

                                        // Calculate Saturation
                                        const saturationConfig = HEADER_IMAGE_EFFECT_CONFIG.SATURATION;
                                        let saturationEffectProgress = 0;
                                        if (fadePercentage >= saturationConfig.SCROLL_PERCENTAGE_END) {
                                            saturationEffectProgress = 1;
                                        } else if (fadePercentage > saturationConfig.SCROLL_PERCENTAGE_START) {
                                            const activeRange = saturationConfig.SCROLL_PERCENTAGE_END - saturationConfig.SCROLL_PERCENTAGE_START;
                                            if (activeRange > 0) {
                                                saturationEffectProgress = (fadePercentage - saturationConfig.SCROLL_PERCENTAGE_START) / activeRange;
                                            }
                                        }
                                        saturationEffectProgress = Math.max(0, Math.min(1, saturationEffectProgress));
                                        const saturationValue = saturationConfig.INITIAL_VALUE + saturationEffectProgress * (saturationConfig.TARGET_VALUE - saturationConfig.INITIAL_VALUE);
                                        BGImage.style.setProperty("--saturation-strength", saturationValue.toString());
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

                    const BGImage = document.querySelector<HTMLElement>(".main-view-container .under-main-view .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") ?? document.querySelector<HTMLElement>(".main-view-container .under-main-view .main-entityHeader-background.main-entityHeader-gradient");
                    if (BGImage) {
                        BGImage.style.opacity = "1";
                        BGImage.style.scale = "1";
                        BGImage.style.removeProperty("--blur-strength");
                        BGImage.style.removeProperty("--saturation-strength");
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

                // Force a small delay to ensure the BackgroundToggle.Enabled state is updated
                setTimeout(() => {
                    // Apply the background if it's enabled
                    if (BackgroundToggle.Enabled) {
                        applyDynamicBg();
                    }
                }, 10);
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
