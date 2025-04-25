/*
    Code was originally made by @surfbryce, but there was a problem, where the items in the InstantStore,
    were getting OUT of their designated "Items" object.

    This is a fixed version.
*/

// Spicetify Services
import { IsDevelopment } from "@socali/Spices/Session";

// Configuration Types
export type ExpirationSettings = {
    Duration: number;
    Unit: ("Weeks" | "Months");
}

// Instant Store Types
type InstantStoreItems = Record<string, unknown>;
type InstantStore = {
    Version: number;
    Items: InstantStoreItems;
};
type InstantStoreInterface<Items> = {
    Items: Items;
    SaveChanges: () => void;
};

const RetrievedInstantStores: Set<string> = new Set();

export const GetInstantStore = <InstantStoreTemplate extends InstantStoreItems>(
    storeName: string,
    version: number,
    template: InstantStoreTemplate,
    forceNewData?: true
): Readonly<InstantStoreInterface<InstantStoreTemplate>> => {
    // Prevent duplicate retrieval
    if (RetrievedInstantStores.has(storeName)) {
        throw new Error(`Can't retrieve InstantStore (${storeName}) twice.`);
    }
    RetrievedInstantStores.add(storeName);

    let store: InstantStore | undefined;

    // Try loading existing
    if (!IsDevelopment || forceNewData === undefined) {
        const serialized = localStorage.getItem(storeName);
        if (serialized !== null) {
            const parsed = JSON.parse(serialized) as InstantStore;
            if (parsed.Version === version) {
                store = parsed;
            }
        }
    }

    // Initialize if missing or forced
    if (store === undefined) {
        store = {
            Version: version,
            Items: JSON.parse(JSON.stringify(template))
        };
    } else {
        // Merge defaults into store.Items only
        const templateChecks: [Record<string, unknown>, Record<string, unknown>, string][] = [
            [store.Items as Record<string, unknown>, template as Record<string, unknown>, `${storeName}.Items`]
        ];

        while (templateChecks.length > 0) {
            const [checkObj, defaultObj, path] = templateChecks.pop()!;
            for (const key in defaultObj) {
                const have = (checkObj as any)[key];
                const want = defaultObj[key];
                if (have === undefined) {
                    (checkObj as any)[key] = JSON.parse(JSON.stringify(want));
                } else if (typeof have === "object" && typeof want === "object") {
                    templateChecks.push([have as Record<string, unknown>, want as Record<string, unknown>, `${path}.${key}`]);
                } else if (typeof have !== typeof want) {
                    throw new Error(`Template Type mismatch for "${path}.${key}"`);
                }
            }
        }
    }

    // Public interface
    return Object.freeze({
        Items: store.Items as InstantStoreTemplate,
        SaveChanges: () => {
            localStorage.setItem(storeName, JSON.stringify(store));
        }
    });
}

// Dynamic Store
export const GetDynamicStoreItem = <I>(storeName: string, itemName: string): I | undefined => {
    const item = localStorage.getItem(`${storeName}:${itemName}`);
    return item !== null ? (item as unknown as I) : undefined;
}

export const SetDynamicStoreItem = (storeName: string, itemName: string, content: string): void => {
    localStorage.setItem(`${storeName}:${itemName}`, content);
}

// Expire Store Types

type ExpireItem<C> = {
    ExpiresAt: number;
    CacheVersion: number;
    Content: C;
};

export type ExpireStoreInterface<ItemType> = {
    GetItem: (itemName: string) => Promise<ItemType | undefined>;
    SetItem: (itemName: string, content: ItemType) => Promise<ItemType>;
};

const RetrievedExpireStores: Set<string> = new Set();

const GetFromCacheAPI = async <C>(storeName: string, itemName: string): Promise<C | undefined> => {
    const cache = await caches.open(storeName);
    const response = await cache.match(`/${itemName}`);
    return response ? response.json() as Promise<C> : undefined;
}

const UpdateCacheAPI = (storeName: string, itemName: string, content: unknown): Promise<void> => {
    return caches.open(storeName)
        .then(cache =>
            cache.put(
                `/${itemName}`,
                new Response(JSON.stringify(content), {
                    headers: { 'Content-Type': 'application/json' }
                })
            )
        )
        .catch(error => {
            console.warn(`Failed to Update Cache API (${storeName}/${itemName})`);
            console.error(error);
        });
}

export const GetExpireStore = <ItemType>(
    storeName: string,
    version: number,
    itemExpirationSettings: ExpirationSettings,
    forceNewData?: true
): Readonly<ExpireStoreInterface<ItemType>> => {
    if (RetrievedExpireStores.has(storeName)) {
        throw new Error(`Can't retrieve ExpireStore (${storeName}) twice.`);
    }
    RetrievedExpireStores.add(storeName);

    return Object.freeze({
        GetItem: (itemName: string) => {
            if (IsDevelopment && forceNewData) {
                return Promise.resolve(undefined);
            }
            return GetFromCacheAPI<ExpireItem<ItemType>>(storeName, itemName)
                .then(expireItem => {
                    if (!expireItem || expireItem.CacheVersion !== version || expireItem.ExpiresAt < Date.now()) {
                        return undefined;
                    }
                    return expireItem.Content;
                });
        },
        SetItem: (itemName: string, content: ItemType) => {
            const expireAtDate = new Date();
            expireAtDate.setHours(0, 0, 0, 0);
            if (itemExpirationSettings.Unit === "Weeks") {
                expireAtDate.setDate(expireAtDate.getDate() + (itemExpirationSettings.Duration * 7));
            } else {
                expireAtDate.setMonth(expireAtDate.getMonth() + itemExpirationSettings.Duration);
                expireAtDate.setDate(0);
            }
            const expireAt = expireAtDate.getTime();
            const expireItem: ExpireItem<ItemType> = {
                ExpiresAt: expireAt,
                CacheVersion: version,
                Content: content
            };
            return UpdateCacheAPI(storeName, itemName, expireItem)
                .then(() => content as ItemType);
        }
    });
}