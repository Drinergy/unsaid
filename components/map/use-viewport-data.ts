/**
 * Loads and holds the thoughts for whatever part of the map is on screen.
 *
 * Zoomed out it asks the server for grid clusters; zoomed in, for the individual thoughts.
 * It keeps only thoughts near the view, drops the rest, and listens for live changes.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Unsaid } from '@/types/unsaid';
import { useRealtime } from '@/lib/hooks/use-realtime';
import { CLUSTER_ZOOM_THRESHOLD } from '@/lib/constants/geolocation';
import { alignBounds, inBounds, KEEP_PAD, pointInBounds, RENDER_PAD, type ViewBounds } from '@/lib/utils/bounds';
import { clusterCellSize, clustersFromApi, mergeOverlapping, type ApiCluster, type Cluster } from '@/lib/utils/clustering';

/** Grid clusters from the server, tagged with the zoom they were computed for */
export type ServerClusters = { zoom: number; clusters: Cluster[] };

const FETCH_DEBOUNCE_MS = 300;
const RAW_LIMIT = 200;

/** Add the incoming thoughts that are not already there */
function mergeById(prev: Unsaid[], incoming: Unsaid[]): Unsaid[] {
  const seen = new Set(prev.map((u) => u.id));
  const merged = [...prev];
  for (const u of incoming) {
    if (!seen.has(u.id)) {
      merged.push(u);
      seen.add(u.id);
    }
  }
  return merged;
}

export function useViewportData(initialUnsaids: Unsaid[]) {
  const [fetched, setFetched] = useState<Unsaid[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(() => new Set());
  const [bounds, setBounds] = useState<ViewBounds | null>(null);
  const [serverClusters, setServerClusters] = useState<ServerClusters | null>(null);
  const [viewCount, setViewCount] = useState<{ count: number; capped: boolean } | null>(null);
  const [dataLoaded, setDataLoaded] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const merge = useCallback((incoming: Unsaid[]) => {
    if (incoming.length > 0) setFetched((prev) => mergeById(prev, incoming));
  }, []);

  const remove = useCallback((unsaidId: string) => {
    setRemovedIds((prev) => new Set(prev).add(unsaidId));
    setFetched((prev) => prev.filter((u) => u.id !== unsaidId));
  }, []);

  const load = useCallback(
    (view: ViewBounds, zoom: number) => {
      // Cancel the previous request so a slow, stale answer cannot arrive after a newer one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      // Cluster requests snap to whole grid cells: the same area always gets the same answer
      // (so counts do not wobble at the screen edge) and the CDN can share it between people.
      const clustered = zoom < CLUSTER_ZOOM_THRESHOLD;
      const box = clustered ? alignBounds(view, clusterCellSize(zoom)) : view;
      const bbox = `${box.minLng},${box.minLat},${box.maxLng},${box.maxLat}`;

      fetch(`/api/unsaids?bbox=${encodeURIComponent(bbox)}&zoom=${zoom}&limit=${RAW_LIMIT}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data?.clusters)) {
            const rows = data.clusters as ApiCluster[];
            // Count what is actually on screen (the request was a little wider than the view)
            const onScreen = rows.filter((r) => pointInBounds({ lat: r.lat, lng: r.lng }, view, 0));
            setViewCount({ count: onScreen.reduce((sum, r) => sum + Number(r.count), 0), capped: false });
            setServerClusters({ zoom, clusters: mergeOverlapping(clustersFromApi(rows), zoom) });
          } else if (Array.isArray(data?.unsaids)) {
            setViewCount({ count: data.unsaids.length, capped: data.unsaids.length >= RAW_LIMIT });
            setServerClusters(null);
            merge(data.unsaids);
          }
          setDataLoaded(true);
        })
        .catch((error) => {
          if (error?.name === 'AbortError') return;
          // Fail quietly; the map stays usable with what it has
          console.error('Error loading viewport unsaids:', error);
          setDataLoaded(true);
        });
    },
    [merge]
  );

  /** Call when the map stops moving: drops far-away thoughts now, loads the new view shortly */
  const onViewChange = useCallback(
    (view: ViewBounds, zoom: number) => {
      setBounds(view);
      setFetched((prev) => {
        const kept = prev.filter((u) => inBounds(u, view, KEEP_PAD));
        return kept.length === prev.length ? prev : kept;
      });
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => load(view, zoom), FETCH_DEBOUNCE_MS);
    },
    [load]
  );

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      abortRef.current?.abort();
    },
    []
  );

  // Live changes (new, removed and hidden thoughts) near the view
  useRealtime({
    viewportBounds: bounds,
    onNewUnsaid: (unsaid) => merge([unsaid]),
    onUnsaidDeleted: remove,
    onUnsaidShadowBanned: remove,
  });

  // The thoughts to draw: what the page already has plus what was loaded, near the view
  const visibleUnsaids = useMemo(() => {
    const all = mergeById(
      initialUnsaids.filter((u) => !removedIds.has(u.id)),
      fetched
    );
    return bounds ? all.filter((u) => inBounds(u, bounds, RENDER_PAD)) : all;
  }, [initialUnsaids, fetched, removedIds, bounds]);

  return { visibleUnsaids, serverClusters, viewCount, dataLoaded, onViewChange };
}
