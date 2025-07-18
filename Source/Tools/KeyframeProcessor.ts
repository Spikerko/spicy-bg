import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";
import keyframesString from "../Stylings/keyframes.ts";
import { Signal } from "@socali/modules/Signal";

function processKeyframes(css: string): string {
    const regex = /@keyframes\s+([a-zA-Z0-9_-]+)/g;
    const matches = [...css.matchAll(regex)];

    interface NameMapEntry {
        originalName: string;
        newName: string;
        declarationMatch: string;
    }

    const nameOccurrences: Record<string, number> = {};
    const nameMap: Record<number, NameMapEntry> = {};

    // Build the name mapping with numbered suffixes for duplicates
    // deno-lint-ignore no-unused-vars
    matches.forEach((match, i) => {
        const originalName = match[1];
        nameOccurrences[originalName] = (nameOccurrences[originalName] || 0) + 1;
        const count = nameOccurrences[originalName];

        const newName = count === 1 ? originalName : `${originalName}${count}`;
        nameMap[match.index!] = {
            originalName,
            newName,
            declarationMatch: match[0]
        };
    });

    // Replace @keyframes declarations
    let updatedCss = css;
    const offsetMap: Record<number, number> = {};

    for (const [indexStr, { originalName, newName, declarationMatch }] of Object.entries(nameMap)) {
        const index = parseInt(indexStr, 10);
        const offset = Object.values(offsetMap).reduce((a, b) => a + b, 0);

        if (originalName !== newName) {
            const newDeclaration = `@keyframes ${newName}`;
            const start = index + offset;
            const end = start + declarationMatch.length;

            updatedCss =
                updatedCss.slice(0, start) +
                newDeclaration +
                updatedCss.slice(end);

            offsetMap[index] = newDeclaration.length - declarationMatch.length;
        }
    }

    // Collect all remapped names
    const usageMap: Record<string, string[]> = {};

    Object.values(nameMap).forEach(({ originalName, newName }) => {
        if (originalName !== newName) {
            if (!usageMap[originalName]) usageMap[originalName] = [];
            if (!usageMap[originalName].includes(newName)) {
                usageMap[originalName].push(newName);
            }
        }
    });

    // Replace animation and animation-name usages
    for (const [original, renamedList] of Object.entries(usageMap)) {
        const usageRegex = new RegExp(
            `(animation(?:-name)?\\s*:[^;]*?)\\b(${original})\\b`,
            'g'
        );

        // deno-lint-ignore no-unused-vars
        updatedCss = updatedCss.replace(usageRegex, (match, prefix: string, name: string) => {
            const renamed = renamedList[0];
            return `${prefix}${renamed}`;
        });
    }

    return updatedCss;
}

export const KeyframesApplied = new Signal();

let AppliedKeyframes = false;

export const ApplyKeyframes = () => {
    if (AppliedKeyframes) return;
    const styleElement = GlobalMaid.Give(document.createElement("style"));
    styleElement.id = "SpicyBG_CSSKeyframes"
    styleElement.innerHTML = processKeyframes(keyframesString).trim().replace(/\s+/g, ' ').replace(/\s*([{}:;,])\s*/g, '$1');
    document.head.appendChild(styleElement);
    AppliedKeyframes = true
    KeyframesApplied.Fire();
}