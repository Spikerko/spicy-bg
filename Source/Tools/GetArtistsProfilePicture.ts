import { SpotifyFetch } from "@spikerko/spices/Spicetify/Services/Session";
import { GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";

const ArtistsProfilePictureStorage = new Map<string, string>();

GlobalMaid.Give(() => {
    ArtistsProfilePictureStorage.clear();
});

const GetArtistsProfilePicture = async (ArtistId: string): Promise<string | undefined> => {
    if (ArtistsProfilePictureStorage.has(ArtistId)) {
        return ArtistsProfilePictureStorage.get(ArtistId);
    }
    const req = await SpotifyFetch(`https://api.spotify.com/v1/artists/${ArtistId}`);
    if (req.status !== 200) return undefined;
    const res = await req.json();
    if (res.images.length === 0) return undefined;
    const ProfilePicture = res.images[1]?.url ?? res.images[2]?.url ?? res.images[0]?.url ?? undefined;
    ArtistsProfilePictureStorage.set(ArtistId, ProfilePicture);
    return ProfilePicture;
}

export default GetArtistsProfilePicture;