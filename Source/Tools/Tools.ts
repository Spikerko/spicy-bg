import { Signal } from "@socali/modules/Signal";
import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";

const Observers = new Map<HTMLElement, ResizeObserver>();
const Signals = new Map<HTMLElement, Signal>()

GlobalMaid.Give(() => {
    Observers.forEach((observer) => {
        observer.disconnect();
    })
    Observers.clear();

    Signals.forEach((signal) => {
        signal.Destroy();
    })
    Signals.clear();
})

export const AppendResizeObserver = (element: HTMLElement): Signal => {
    if (!element) throw new Error("Missing 'element'");
    if (Observers.has(element)) throw new Error("Element already has a observer");

    const signal = new Signal();
    Signals.set(element, signal);

    const observer = new ResizeObserver(() => signal.Fire());
    Observers.set(element, observer);

    observer.observe(element);

    return signal;
}