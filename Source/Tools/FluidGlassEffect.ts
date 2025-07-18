import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";

let applied = false;

export const ApplyFluidGlassEffectToDOM = () => {
    if (applied) return;
    const svg = GlobalMaid.Give(document.createElement("svg"));
    svg.innerHTML = `
        <filter id="FluidGlassEffect">
            <feTurbulence type="turbulence" 
                baseFrequency="0.01" 
                numOctaves="2" 
                result="turbulence" />
    
            <feDisplacementMap in="SourceGraphic"
                in2="turbulence"    
                            scale="200" xChannelSelector="R" yChannelSelector="G" />
        </filter>
    `
    svg.style.display = "none";
    document.body.appendChild(svg);
    applied = true;
}