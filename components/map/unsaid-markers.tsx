/**
 * The lights on the map. Zoomed out they are grid clusters with a count (from the server);
 * zoomed in they are single thoughts, and thoughts that overlap on screen become one group.
 *
 * Click a cluster: zoom in on it. Click a thought: zoom to it, then open it.
 * Click a group: pick from a list.
 */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import type { LeafletMouseEvent } from 'leaflet';
import L from 'leaflet';
import type { Unsaid } from '@/types/unsaid';
import LightAvatar from '@/components/unsaid/light-avatar';
import { NODE_OPEN_ZOOM, CLUSTER_ZOOM_THRESHOLD } from '@/lib/constants/geolocation';
import { clusterRadius, getThoughtsBounds, groupByPixel, type Cluster } from '@/lib/utils/clustering';
import { getOpacityByAge, getThoughtAge, timeAgo } from '@/lib/utils/thought-age';
import type { ServerClusters } from './use-viewport-data';
import { COPY } from '@/lib/copy';
import { SHARED_EVENT, type SharedDetail } from '@/lib/utils/notices';

/** A finger needs about 44px; the glowing dots are only 8 to 12px wide. */
const TOUCH_HIT_SIZE = 44;

function useCoarsePointer(): boolean {
  const [coarse, setCoarse] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(pointer: coarse)');
    const update = () => setCoarse(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return coarse;
}

/**
 * The light is a plain HTML circle with a CSS glow (box-shadow), not an SVG shape with a filter: Safari does
 * not draw CSS filters on SVG shapes, so the halo was missing there. Icons are shared between dots that look
 * the same.
 */
const iconCache = new Map<string, L.DivIcon>();
function dotIcon(radius: number, hit: number, extraClass: string, opacity: number): L.DivIcon {
  const box = Math.max(radius * 2 + 4, hit);
  const key = `${box}|${radius}|${extraClass}|${opacity}`;
  let icon = iconCache.get(key);
  if (!icon) {
    const size = radius * 2 + 2;
    icon = L.divIcon({
      className: 'light-marker-box',
      html: `<span class="light-marker ${extraClass}" style="width:${size}px;height:${size}px;font-size:${size}px;--o:${opacity}"></span>`,
      iconSize: [box, box],
      iconAnchor: [box / 2, box / 2],
    });
    iconCache.set(key, icon);
  }
  return icon;
}

/**
 * One glowing dot. With a mouse it shows a tooltip on hover. On a touch screen the tap area is a 44px
 * box around the dot (a hover tooltip makes no sense there, and the tap opens the thought anyway).
 */
function Dot({
  center,
  radius,
  opacity = 1,
  dim = false,
  fresh = false,
  onClick,
  tooltip,
  coarse,
}: {
  center: [number, number];
  radius: number;
  /** 1 for new thoughts, less for older ones */
  opacity?: number;
  /** Older thoughts glow less */
  dim?: boolean;
  /** Just shared: its light arrives slowly */
  fresh?: boolean;
  onClick: (e: LeafletMouseEvent) => void;
  tooltip: React.ReactNode;
  coarse: boolean;
}): React.ReactElement {
  const icon = dotIcon(radius, coarse ? TOUCH_HIT_SIZE : 0, `${dim ? 'light-marker--dim' : ''} ${fresh ? 'light-marker--new' : ''}`.trim(), opacity);
  return (
    <Marker position={center} icon={icon} keyboard={false} eventHandlers={{ click: onClick }}>
      {!coarse && (
        <Tooltip permanent={false} direction="top" offset={[0, -(radius + 6)]} className="unsaid-tooltip" opacity={1}>
          {tooltip}
        </Tooltip>
      )}
    </Marker>
  );
}

/** Two soft rings that spread out from a thought that was just shared (animated in globals.css) */
const RIPPLE_ICON = L.divIcon({ className: 'unsaid-ripple', html: '<span></span><span></span>', iconSize: [0, 0] });
const FRESH_MS = 8000;

/**
 * The light someone just wrote: fly there, and let it glow in slowly with soft ripples, so they can
 * see their words arrive. Skips the flight for people who asked for less motion.
 */
function useFreshThought(): { id: string; lat: number; lng: number } | null {
  const map = useMap();
  const [fresh, setFresh] = useState<{ id: string; lat: number; lng: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onShared = (e: Event) => {
      const thought = (e as CustomEvent<SharedDetail>).detail.thought;
      if (!thought) return;
      setFresh(thought);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setFresh(null), FRESH_MS);

      // Close enough to show single lights (they are grouped into counts when zoomed out)
      const zoom = Math.max(map.getZoom(), CLUSTER_ZOOM_THRESHOLD);
      const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      map.flyTo([thought.lat, thought.lng], zoom, { animate: !calm, duration: 1.8 });
    };
    window.addEventListener(SHARED_EVENT, onShared);
    return () => {
      window.removeEventListener(SHARED_EVENT, onShared);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [map]);

  return fresh;
}

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
  const coarse = useCoarsePointer();
  const fresh = useFreshThought();

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
          <Dot
            key={`cluster-${cluster.center.lat}-${cluster.center.lng}-${index}`}
            coarse={coarse}
            center={[cluster.center.lat, cluster.center.lng]}
            radius={clusterRadius(cluster.count)}
            // A "cluster" of one is just a thought: zoom to it and open it, like in the close-up view
            onClick={() => (cluster.count === 1 && cluster.thoughts[0] ? handleNodeClick(cluster.thoughts[0]) : handleClusterClick(cluster))}
            tooltip={
              cluster.count === 1 ? (
                <div>
                  {cluster.thoughts[0].content.length > 80
                    ? cluster.thoughts[0].content.slice(0, 80) + '...'
                    : cluster.thoughts[0].content}
                </div>
              ) : (
                <div className="whitespace-nowrap">
                  <span className="font-semibold">{cluster.count.toLocaleString()} thoughts</span>
                  <span className="text-gray-400"> · {COPY.clusterHint}</span>
                </div>
              )
            }
          />
        ))}
        {fresh && <Marker position={[fresh.lat, fresh.lng]} icon={RIPPLE_ICON} interactive={false} keyboard={false} zIndexOffset={-200} />}
      </>
    );
  }

  return (
    <>
      {fresh && <Marker position={[fresh.lat, fresh.lng]} icon={RIPPLE_ICON} interactive={false} keyboard={false} zIndexOffset={-200} />}
      {groups.map((group) => {
        if (group.length > 1) {
          const center = {
            lat: group.reduce((sum, t) => sum + t.location.lat, 0) / group.length,
            lng: group.reduce((sum, t) => sum + t.location.lng, 0) / group.length,
          };
          return (
            <Dot
              key={`group-${group.map((t) => t.id).join('-')}`}
              coarse={coarse}
              center={[center.lat, center.lng]}
              radius={Math.min(7 + group.length, 16)}
              fresh={group.some((t) => t.id === fresh?.id)}
              onClick={(e) => {
                e.target.closeTooltip?.(); // else the hover tooltip covers the popup
                setOpenGroup({
                  center,
                  thoughts: [...group].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
                  zoom: effectiveZoom,
                });
              }}
              tooltip={
                <div className="whitespace-nowrap">
                  <span className="font-semibold">{group.length} thoughts here</span>
                  <span className="text-gray-400"> · {COPY.groupHint}</span>
                </div>
              }
            />
          );
        }

        const unsaid = group[0];
        const opacity = getOpacityByAge(unsaid.createdAt);
        const age = getThoughtAge(unsaid.createdAt);
        const previewText = unsaid.content.length > 120
          ? unsaid.content.substring(0, 120) + '...'
          : unsaid.content;

        return (
          <Dot
            key={unsaid.id}
            coarse={coarse}
            center={[unsaid.location.lat, unsaid.location.lng]}
            radius={age.isRecent ? 5 : 4}
            opacity={Math.min(1, 0.4 + 0.6 * opacity)}
            dim={opacity < 0.6}
            fresh={fresh?.id === unsaid.id}
            onClick={() => handleNodeClick(unsaid)}
            tooltip={<div>{previewText}</div>}
          />
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
