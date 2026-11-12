import { Alert } from "react-native";
import { useCallback, useEffect } from "react";

import { removeLocalSong, toggleLocalFavorite } from "@/src/services/musicStorage";
import { usePlayer } from "@/src/store/player";
import { useDownloadQueue } from "@/src/store/downloads";
import { useLibrary } from "@/src/store/library";

export function useDownloads() {
  const { items, enqueue, cancel, retry } = useDownloadQueue();
  const downloaded = useLibrary(state => state.songs);
  const refresh = useCallback(async () => {
    await useLibrary.getState().refresh();
    if (!useLibrary.getState().error) usePlayer.getState().setLibrary(useLibrary.getState().songs);
  }, []);
  useEffect(() => { void refresh().catch(error => Alert.alert('Library unavailable', String(error))); }, [refresh]);

  const remove = useCallback(
    async (id: string) => {
      try {
        if (usePlayer.getState().currentTrack?.id === id) usePlayer.getState().pause();
        await removeLocalSong(id);
        await refresh();

      } catch (error) { Alert.alert("Delete failed", String(error)); }
    },
    [refresh],
  );

  const favorite = useCallback(async (id: string) => {
    try { await toggleLocalFavorite(id); await refresh(); }
    catch (error) { Alert.alert("Favorite failed", String(error)); }
  }, [refresh]);

  return { favorite, items, downloaded, enqueue, cancel, retry, remove, refresh };
}
