import { Spotify, GlobalMaid } from "@spikerko/spices/Spicetify/Services/Session";

const ArtistsProfilePictureStorage = new Map<string, string>();

GlobalMaid.Give(() => {
    ArtistsProfilePictureStorage.clear();
});

const GetArtistsProfilePicture = async (ArtistId: string): Promise<string | undefined> => {
    if (ArtistsProfilePictureStorage.has(ArtistId)) {
        return ArtistsProfilePictureStorage.get(ArtistId);
    }
    const responseRequest = await Spotify.GraphQL.Request(
        Spotify.GraphQL.Definitions.queryArtistOverview,
        { uri: `spotify:artist:${ArtistId}`, locale: Spotify.Locale._locale }
    )
    if (
        !responseRequest.data ||
        !responseRequest.data.artistUnion ||
        !responseRequest.data.artistUnion.visuals ||
        !responseRequest.data.artistUnion.visuals.avatarImage ||
        !responseRequest.data.artistUnion.visuals.avatarImage.sources
    ) return undefined;
    const images = responseRequest.data?.artistUnion?.visuals?.avatarImage?.sources ?? [];
    if (images.length === 0) return undefined;
    const ProfilePicture = images[2]?.url ?? images[0]?.url ?? images[1]?.url ?? undefined;
    ArtistsProfilePictureStorage.set(ArtistId, ProfilePicture);
    return ProfilePicture;
}

export default GetArtistsProfilePicture;