/**
 * The lights on the map. Zoomed out they are grid clusters with a count (from the server);
 * zoomed in they are single thoughts, and thoughts that overlap on screen become one group.
 *
 * Click a cluster: zoom in on it. Click a thought: zoom to it, then open it.
 * Click a group: pick from a list.
 */

'use client';

import { useCallback, useMemo, useState } from 'react';
import { CircleMarker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import type { Unsaid } from '@/types/unsaid';
import LightAvatar from '@/components/unsaid/light-avatar';
import { NODE_OPEN_ZOOM, CLUSTER_ZOOM_THRESHOLD } from '@/lib/constants/geolocation';
import { clusterRadius, getThoughtsBounds, groupByPixel, type Cluster } from '@/lib/utils/clustering';
import { getOpacityByAge, getThoughtAge, timeAgo } from '@/lib/utils/thought-age';
import type { ServerClusters } from './use-viewport-data';

export default function UnsaidMarkers({
  unsaids,
  serverClusters,
  onUnsaidClick,
}: {
  unsaids: Unsaid[];
  serverClusters: ServerClusters | null;
  onUnsaidClick: (unsaid: Unsaid) => void;
}): React.ReactElement {
  const map = useMap();

  // Start from the map's real zoom (the default would briefly cluster a whole country into one dot)
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ moveend: () => setZoom(map.getZoom()) });

  const effectiveZoom = zoom;
  const useClusterView = effectiveZoom < CLUSTER_ZOOM_THRESHOLD;

  // The open group list belongs to the zoom it was opened at; zooming closes it
  const [openGroup, setOpenGroup] = useState<{ center: { lat: number; lng: number }; thoughts: Unsaid[]; zoom: number } | null>(null);
  const groups = useMemo(
    () => (useClusterView ? [] : groupByPixel(unsaids, effectiveZoom)),
    [unsaids, effectiveZoom, useClusterView]
  );

  // Server clusters give true counts for the whole view. They are only valid for the zoom they
  // were computed at: after a zoom (e.g. the fly-in from the landing page) show nothing until
  // the new answer arrives, instead of stale clusters from the old zoom.
  const clusters = useMemo(
    () =>
      serverClusters && Math.round(serverClusters.zoom) === Math.round(effectiveZoom)
        ? serverClusters.clusters
        : [],
    [serverClusters, effectiveZoom]
  );
  const showClusterMarkers = useClusterView && clusters.length > 0;

  const handleClusterClick = useCallback(
    (cluster: Cluster) => {
      const bounds = cluster.bounds ?? getThoughtsBounds(cluster.thoughts);
      const latLngBounds = L.latLngBounds(bounds[0], bounds[1]);
      map.flyToBounds(latLngBounds, {
        padding: [60, 60],
        maxZoom: NODE_OPEN_ZOOM,
        duration: 1.2,
        easeLinearity: 0.25,
      });
    },
    [map]
  );

  const handleNodeClick = useCallback(
    (unsaid: Unsaid) => {
      // Already close enough: nothing will move, so no `moveend` would ever fire. Open right away.
      if (map.getZoom() >= NODE_OPEN_ZOOM) {
        onUnsaidClick(unsaid);
        return;
      }

      // Otherwise zoom to the thought first, then open it. The timer is a safety net in case
      // the map never reports the move finishing; whichever comes first opens it, once.
      let opened = false;
      const open = () => {
        if (opened) return;
        opened = true;
        map.off('moveend', open);
        clearTimeout(timer);
        onUnsaidClick(unsaid);
      };
      const timer = setTimeout(open, 1800);
      map.on('moveend', open);
      map.setView([unsaid.location.lat, unsaid.location.lng], NODE_OPEN_ZOOM, {
        animate: true,
        duration: 1.2,
        easeLinearity: 0.25,
      });
    },
    [map, onUnsaidClick]
  );

  if (showClusterMarkers) {
    return (
      <>
        {clusters.map((cluster, index) => (
          <CircleMarker
            key={`cluster-${cluster.center.lat}-${cluster.center.lng}-${index}`}
            center={[cluster.center.lat, cluster.center.lng]}
            radius={clusterRadius(cluster.count)}
            pathOptions={{
              className: 'unsaid-dot marker-fade-in',
              color: 'rgba(255, 214, 170, 0.7)',
              weight: 2,
              fillColor: 'rgba(255, 214, 170, 0.9)',
              fillOpacity: 0.9,
            }}
            eventHandlers={{
              // A "cluster" of one is just a thought: zoom to it and open it, like in the close-up view
              click: () => (cluster.count === 1 && cluster.thoughts[0] ? handleNodeClick(cluster.thoughts[0]) : handleClusterClick(cluster)),
            }}
          >
            <Tooltip
              permanent={false}
              direction="top"
              offset={[0, -10]}
              className="unsaid-tooltip"
              opacity={1}
            >
              {cluster.count === 1 ? (
                <div>
                  {cluster.thoughts[0].content.length > 80
                    ? cluster.thoughts[0].content.slice(0, 80) + '...'
                    : cluster.thoughts[0].content}
                </div>
              ) : (
                <div className="whitespace-nowrap">
                  <span className="font-semibold">{cluster.count.toLocaleString()} thoughts</span>
                  <span className="text-gray-400"> · click to zoom in</span>
                </div>
              )}
            </Tooltip>
          </CircleMarker>
        ))}
      </>
    );
  }

  return (
    <>
      {groups.map((group) => {
        if (group.length > 1) {
          const center = {
            lat: group.reduce((sum, t) => sum + t.location.lat, 0) / group.length,
            lng: group.reduce((sum, t) => sum + t.location.lng, 0) / group.length,
          };
          return (
            <CircleMarker
              key={`group-${group.map((t) => t.id).join('-')}`}
              center={[center.lat, center.lng]}
              radius={Math.min(7 + group.length, 16)}
              pathOptions={{
                className: 'unsaid-dot',
                color: 'rgba(255, 214, 170, 0.7)',
                weight: 2,
                fillColor: 'rgba(255, 214, 170, 0.9)',
                fillOpacity: 0.9,
              }}
              eventHandlers={{
                click: (e) => {
                  e.target.closeTooltip(); // else the hover tooltip covers the popup
                  setOpenGroup({
                    center,
                    thoughts: [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
                    zoom: effectiveZoom,
                  });
                },
              }}
            >
              <Tooltip permanent={false} direction="top" offset={[0, -10]} className="unsaid-tooltip" opacity={1}>
                <div className="whitespace-nowrap">
                  <span className="font-semibold">{group.length} thoughts here</span>
                  <span className="text-gray-400"> · click to browse</span>
                </div>
              </Tooltip>
            </CircleMarker>
          );
        }

        const unsaid = group[0];
        const opacity = getOpacityByAge(unsaid.createdAt);
        const age = getThoughtAge(unsaid.createdAt);
        const previewText = unsaid.content.length > 120
          ? unsaid.content.substring(0, 120) + '...'
          : unsaid.content;

        return (
          <CircleMarker
            key={unsaid.id}
            center={[unsaid.location.lat, unsaid.location.lng]}
            radius={age.isRecent ? 5 : 4}
            pathOptions={{
              className: 'unsaid-dot marker-fade-in',
              color: `rgba(255, 214, 170, ${0.55 * opacity})`,
              weight: 1,
              fillColor: `rgba(255, 214, 170, ${0.95 * opacity})`,
              fillOpacity: 0.95 * opacity,
            }}
            eventHandlers={{
              click: () => handleNodeClick(unsaid),
            }}
          >
            <Tooltip
              permanent={false}
              direction="top"
              offset={[0, -10]}
              className="unsaid-tooltip"
              opacity={1}
            >
              <div>{previewText}</div>
            </Tooltip>
          </CircleMarker>
        );
      })}

      {openGroup && openGroup.zoom === effectiveZoom && (
        <Popup
          position={[openGroup.center.lat, openGroup.center.lng]}
          className="unsaid-group-popup"
          eventHandlers={{ remove: () => setOpenGroup(null) }}
        >
          <ul className="max-h-60 overflow-y-auto space-y-1 pr-1">
            {openGroup.thoughts.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  className="ctl flex w-full items-start gap-2.5 rounded-xl border border-transparent px-2 py-2 text-left"
                  onClick={() => {
                    map.closePopup();
                    handleNodeClick(t);
                  }}
                >
                  <LightAvatar size={24} className="mt-0.5" />
                  <span className="min-w-0 flex-1 text-[13px] leading-snug text-gray-100">
                    {t.content.length > 90 ? t.content.slice(0, 90) + '...' : t.content}
                  </span>
                  <span className="shrink-0 text-xs text-gray-400">{timeAgo(t.createdAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Popup>
      )}
    </>
  );
}
