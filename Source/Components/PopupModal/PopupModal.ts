import { Maid } from "@socali/modules/Maid";
import PrefixError from "@spikerko/tools/PrefixError";
import Icons from "../../Icons.ts";
import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";
import { Timeout } from "@socali/modules/Scheduler";

/* 
    This component is not finished yet.
    Don't use it.
*/


const PopupModalError = new PrefixError({
    name: "PopupModalError",
    prefix: "PopupModal: "
}).Create();

type PopupModalInput = {
    ModalId: string;
    Title: string;
    Content: string;
    ShowCloseButton?: boolean;
}


const EXIT_ENTER_ANIMATION_DURATION = 0.3;
const POPUP_MODAL_CSS_TEMPLATE = `

    @keyframes -1__Enter_Overlay {
        0% {
            opacity: 0;
        }
        100% {
            opacity: 1;
        }
    }

    @keyframes -1__Enter_Container {
        0% {
            scale: 0;
        }
        100% {
            scale: 1;
        }
    }

    @keyframes -1__Exit_Overlay {
        0% {
            opacity: 1;
        }
        100% {
            opacity: 0;
        }
    }

    @keyframes -1__Exit_Container {
        0% {    
            scale: 1;
        }
        100% {
            scale: 0;
        }
    }
    #-1 {
        position: fixed;
        inset: 0;
        width: 100cqw;
        height: 100cqh;
        background-color: rgba(0, 0, 0, 0.1);
        backdrop-filter: blur(10px);
        z-index: 9999;
        display: flex;
        justify-content: center;
        align-items: center;
        container-type: size;
        animation: -1__Enter_Overlay ${EXIT_ENTER_ANIMATION_DURATION}s forwards;
    }
    
    #-1.Exiting {
        animation: -1__Exit_Overlay ${EXIT_ENTER_ANIMATION_DURATION}s forwards;
    }

    #-1 .Container {
        min-width: 30cqw;
        max-width: 50cqw;
        min-height: 50cqh;
        max-height: 80cqh;
        background-color: rgba(0, 0, 0, 0.8);
        backdrop-filter: blur(15px);
        border-radius: 5px;
        display: flex;
        flex-direction: column;
        container-type: size;
        animation: -1__Enter_Container ${EXIT_ENTER_ANIMATION_DURATION}s forwards;
    }

    #-1.Exiting .Container {
        animation: -1__Exit_Container ${EXIT_ENTER_ANIMATION_DURATION}s forwards;
    }

    #-1 .Container .Header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        width: 100%;
        height: 50px;
        padding: 0 25px;
        border-bottom: 1px solid rgba(255, 255, 255, .35);
        container-type: size;
    }

    #-1 .Container .Header .Title {
        font-size: 1.5rem;
        font-family: SpicyLyrics;
        font-weight: 700;
        color: #fff;
    }

    #-1 .Container .Header .CloseButton {
        color: #fff;
        cursor: pointer;
        transition: scale 0.2s;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        container-type: size;
        justify-content: center;
    }

    #-1 .Container .Header .CloseButton:hover {
        scale: 1.15;
    }

    #-1 .Container .Content {
        font-size: 1.5rem;
        font-family: SpicyLyrics;
        color: #fff;
        padding: 15px 20px 20px 20px;
        flex: 1;
        min-height: 0;
        container-type: size;
        overflow-y: auto;
        overflow-x: hidden;
        word-wrap: break-word;
        white-space: normal;
        width: 100%;
    }
`

export default class PopupModal {
    private maid: Maid;
    public ModalElement: HTMLDivElement | null;
    public StyleElement: HTMLStyleElement | null;
    private Input: PopupModalInput;

    constructor({
        ModalId,
        Title,
        Content,
        ShowCloseButton = true
    }: PopupModalInput) {
        this.maid = GlobalMaid.Give(new Maid());
        if (!Title || !Content) {
            throw new PopupModalError("Title and Content are required");
        }
        this.Input = {
            ModalId,
            Title,
            Content,
            ShowCloseButton
        }
        this.ModalElement = null;
        this.StyleElement = null;
    }

    private CreateModalElement(title: string, content: string, showClose: boolean) {
        const modalId = `PopupModal__${this.Input.ModalId}`;
        const modal = document.createElement("div");
        modal.id = modalId;
        modal.innerHTML = `
            <div class="Container">
                <div class="Header">
                    <div class="Title">${title}</div>
                    ${showClose ? `<div class="CloseButton">${Icons.Close.replace('height="16" width="16"', 'style="fill: currentColor; width: 100cqw; height: 100cqh;"')}</div>` : ""}
                </div>
                <div class="Content">${content}</div>
            </div>
        `.trim();

        const closeModalEvent = () => {
            this.Close();
        }

        const closeButton = modal.querySelector(".CloseButton");
        if (closeButton) {
            closeButton.addEventListener("click", closeModalEvent);
            this.maid.Give(() => {
                closeButton.removeEventListener("click", closeModalEvent);
            });
        }

        const modalClickEvent = (e: MouseEvent) => {
            if (e.target === modal) {
                this.Close();
            }
        }

        if (modal) {
            modal.addEventListener("click", modalClickEvent);
            this.maid.Give(() => {
                modal.removeEventListener("click", closeModalEvent);
            });
        }

        this.maid.Give(modal);

        const style = document.createElement("style");
        style.innerHTML = POPUP_MODAL_CSS_TEMPLATE
            .replaceAll("-1", modalId)
            .replace(/\s+/g, ' ')
            .replace(/\s*{\s*/g, '{')
            .replace(/\s*}\s*/g, '}')
            .replace(/\s*:\s*/g, ':')
            .replace(/\s*;\s*/g, ';')
            .trim();
        style.id = `${modalId}__styling`;

        this.maid.Give(style);

        return { modal, style };
    }

    public Open() {
        const { modal, style } = this.CreateModalElement(this.Input.Title, this.Input.Content, this.Input.ShowCloseButton!);
        document.body.appendChild(modal);
        document.head.appendChild(style);

        this.ModalElement = modal;
        this.StyleElement = style;

        this.maid.Give(() => this.ModalElement = null);
        this.maid.Give(() => this.StyleElement = null);
    }

    public Close() {
        this.ModalElement!.classList.add("Exiting");
        this.maid.Give(Timeout(EXIT_ENTER_ANIMATION_DURATION + 0.05, () => {
            this.ModalElement!.classList.remove("Exiting");
            this.maid.CleanUp();
        }));
    }
    
    public Destroy() {
        this.maid.Destroy();
    }
}

// deno-lint-ignore no-explicit-any
//(globalThis as any).PopupModal = PopupModal;