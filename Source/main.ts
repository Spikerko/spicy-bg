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
    BLUR_AMOUNT: 40,            // Blur amount in pixels
    ROTATION_SPEED: 0.2         // Rotation speed
};

// Define variables at module scope so they can be accessed by cleanup functions
let lastCoverArt: string | undefined = undefined;
let currentDBGMaid: Maid | undefined;
let currentBgElement: DynamicBackground | undefined = undefined;
let backgroundContainer: HTMLElement | undefined;

OnSpotifyReady
.then(
    () => {
        // deno-lint-ignore no-explicit-any
        (globalThis as any).SpicyBG = {}
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
                            } else {
                                // Create a new background
                                // Destroy the old one if it exists
                                if (currentBgElement) {
                                    try {
                                        (currentBgElement as unknown as { Destroy: () => void }).Destroy();
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

                                // Initialize with the current cover art
                                await currentBgElement.Update({
                                    image: CoverArt,
                                    placeholderHueShift
                                });

                                // Append to the background container
                                currentBgElement.AppendToElement(backgroundContainer);

                                // Update the last cover art
                                lastCoverArt = CoverArt;
                            }
                        } catch (error) {
                            console.error("Failed to create/update dynamic background:", error);

                            // If update fails, create a new background
                            if (currentBgElement) {
                                try {
                                    (currentBgElement as unknown as { Destroy: () => void }).Destroy();
                                } catch (error) {
                                    console.error("Failed to destroy background:", error);
                                }
                                currentBgElement = undefined;
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

                            // Initialize with the current cover art
                            await currentBgElement.Update({
                                image: CoverArt,
                                placeholderHueShift
                            });

                            // Append to the background container
                            currentBgElement.AppendToElement(backgroundContainer);

                            // Update the last cover art
                            lastCoverArt = CoverArt;
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

        {
            let scrollNodeWhentil: CancelableTask | undefined = undefined;
            let HeaderContentWhentil: CancelableTask | undefined = undefined;
            let UMVWhentil: CancelableTask | undefined = undefined;
            let bgImageWhentil: CancelableTask | undefined = undefined;
            let currentEventAbortController: AbortController | undefined = undefined;
            let hasBGImage: boolean = false;  // Track if current page has BGImage

            let lastLocation: string | undefined = undefined;

            const historyListenerCallback = (event: HistoryLocation) => {
                if (lastLocation === event.pathname) return;
                lastLocation = event.pathname;
                // If we had a BGImage and we're navigating away, cleanup the controller
                if (hasBGImage && currentEventAbortController) {
                    currentEventAbortController.abort();
                    currentEventAbortController = undefined;
                }
                hasBGImage = false;  // Reset flag for new page

                const EventAbortController = new AbortController();
                currentEventAbortController = EventAbortController;

                scrollNodeWhentil = Whentil.When(() => document.querySelector<HTMLElement>(`.main-view-container .main-view-container__scroll-node [data-overlayscrollbars-viewport="scrollbarHidden overflowXHidden overflowYScroll"]`),
                (Element: HTMLElement | null) => {
                    if (!Element) return;
                    UMVWhentil = Whentil.When(() => document.querySelector<HTMLElement>(`.main-view-container .under-main-view`),
                        (UMVElement: HTMLElement | null) => {
                            if (!UMVElement) return;
                            bgImageWhentil = Whentil.When(() => UMVElement.querySelector<HTMLElement>("div .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") || UMVElement.querySelector<HTMLElement>("div .main-entityHeader-background.main-entityHeader-gradient"),
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
                                    }

                                    if (BackgroundToggle.Enabled) {
                                        const ContentSpacing = HeaderContent.querySelector<HTMLElement>(".iWTIFTzhRZT0rCD0_gOK");
                                        const ArtistId = (event.pathname.includes("/artist/") ? event.pathname.replace("/artist/", "") : undefined);
                                        if (ContentSpacing && ArtistId) {
                                            GetArtistsProfilePicture(ArtistId)
                                                .then(ArtistProfilePicture => {
                                                    if (ArtistProfilePicture === undefined) {
                                                        return;
                                                    }
                                                    const ExistingPfp = ContentSpacing.querySelector<HTMLElement>(".main-entityHeader-imageContainer");
                                                    if (ExistingPfp) {
                                                        ExistingPfp.remove();
                                                    }
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
                                                    ContentSpacing.insertBefore(ProfilePictureElement, ContentSpacing.lastChild);
                                                    HeaderContent.classList.add("ProfilePictureApplied");
                                                })
                                                .catch((error) => {
                                                    console.error("Failed to get Artist Profile Picture", error, ArtistId);
                                                    HeaderContent.classList.remove("ProfilePictureApplied");
                                                    ShowNotification(`SpicyBG: Failed to get Artist Profile Picture for ${ArtistId}. Please report this to the developer, as an issue on Github, or on my Discord: @spikerko`, "error", 5);
                                                })
                                            
                                        }
                                    }

                                    // Set initial opacity based on scroll position
                                    const scrollTop = Element.scrollTop;

                                    // Calculate the maximum scroll value where the image should be fully transparent
                                    // Using 0.8x the image height for a more aggressive transition
                                    const maxScrollForFullTransparent = BGImage.offsetHeight * 0.8;

                                    // Clip multiplier to make the fading more aggressive (higher = more aggressive)
                                    const fadeMultiplier = 3.85;

                                    // Calculate fade percentage with multiplier (0% when at top, reaches 100% faster)
                                    const fadePercentage = Math.min(100, Math.max(0, (scrollTop / maxScrollForFullTransparent) * 100 * fadeMultiplier));
                                    // Calculate opacity (1 when fadePercentage is 0, 0 when fadePercentage is 100)
                                    const opacity = 0.95 - (fadePercentage / 100);
                                    BGImage.style.opacity = opacity.toString();

                                    if (HeaderContent && opacity <= 0.35) {
                                        if (BackgroundToggle.Enabled) {
                                            HeaderContent.classList.add("ScrolledPast")
                                        }
                                    } else {
                                        if (BackgroundToggle.Enabled) {
                                            HeaderContent?.classList.remove("ScrolledPast")
                                        }
                                    }

                                    // Calculate scale
                                    const scale = 1.05 - (fadePercentage / 100) * 0.05;
                                    if (BackgroundToggle.Enabled) {
                                        BGImage.style.scale = scale.toString();
                                    }

                                    Element.addEventListener("scroll", () => {
                                        if (!BackgroundToggle.Enabled) {
                                            HeaderContent.classList.remove("ScrolledPast");
                                            HeaderContent.classList.remove("ProfilePictureApplied");
                                            BGImage.style.opacity = "1";
                                            BGImage.style.scale = "1";
                                            return;
                                        }
                                        const scrollTop = Element.scrollTop;

                                        // Calculate fade percentage using the same formula with multiplier
                                        const fadePercentage = Math.min(100, Math.max(0, (scrollTop / maxScrollForFullTransparent) * 100 * fadeMultiplier));
                                        // Calculate opacity
                                        const opacity = 1 - (fadePercentage / 100);
                                        BGImage.style.opacity = opacity.toString();

                                        if (HeaderContent && opacity <= 0.35) {
                                            HeaderContent.classList.add("ScrolledPast")
                                        } else {
                                            HeaderContent?.classList.remove("ScrolledPast")
                                        }

                                        // Calculate scale
                                        const scale = 1.05 - (fadePercentage / 100) * 0.05;
                                        BGImage.style.scale = scale.toString();
                                    }, { signal: EventAbortController.signal });
                                })
                                GlobalMaid.Give(Timeout(40, () => HeaderContentWhentil?.Cancel()));
                            })
                            GlobalMaid.Give(Timeout(40, () => bgImageWhentil?.Cancel()));
                        }
                    )
                    GlobalMaid.Give(Timeout(40, () => UMVWhentil?.Cancel()));
                })
                GlobalMaid.Give(Timeout(40, () => scrollNodeWhentil?.Cancel()));
            };
            GlobalMaid.Give(SpotifyHistory.listen(historyListenerCallback));
            historyListenerCallback(SpotifyHistory.location);
            GlobalMaid.Give(() => scrollNodeWhentil?.Cancel())
            GlobalMaid.Give(() => UMVWhentil?.Cancel())
            GlobalMaid.Give(() => bgImageWhentil?.Cancel());
            GlobalMaid.Give(() => currentEventAbortController?.abort());
            GlobalMaid.Give(GetToggleSignal().Connect(() => {
                if (!BackgroundToggle.Enabled) {
                    const HeaderContent = document.querySelector<HTMLElement>(".main-view-container .main-entityHeader-container.main-entityHeader-withBackgroundImage")
                    if (HeaderContent) {
                        HeaderContent.classList.remove("ScrolledPast");
                    }

                    const BGImage = document.querySelector<HTMLElement>(".main-view-container .under-main-view .wozXSN04ZBOkhrsuY5i2.XUwMufC5NCgIyRMyGXLD") ?? document.querySelector<HTMLElement>(".main-view-container .under-main-view .main-entityHeader-background.main-entityHeader-gradient");
                    if (BGImage) {
                        BGImage.style.opacity = "1";
                        BGImage.style.scale = "1";
                    }

                    const ContentSpacing = HeaderContent?.querySelector<HTMLElement>(".iWTIFTzhRZT0rCD0_gOK");
                    const ExistingPfp = ContentSpacing?.querySelector<HTMLElement>(".main-entityHeader-imageContainer");
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
