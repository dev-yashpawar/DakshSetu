import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { useSession } from "../store/session";
import { useTranslate } from "../localization";
import { api } from "../services/api";
import {
  isOnline,
  pendingItems,
  syncPending,
  retryPending,
  getStorageError,
  offlineDatabase,
  clearDeviceData,
  discardResource,
  deviceDraftCount,
  activeOwner,
  type SyncItem,
} from "../services/offline";
export function useConnectivity() {
  const [online, setOnline] = useState(isOnline);
  useEffect(() => {
    const update = () => setOnline(isOnline());
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
export function OfflineStatus() {
  const tr = useTranslate(),
    { user } = useSession(),
    online = useConnectivity();
  const [items, setItems] = useState<SyncItem[]>([]),
    [error, setError] = useState(""),
    [storageError, setStorageError] = useState(""),
    [draftCount, setDraftCount] = useState(0);
  useEffect(() => {
    let active = true;
    const update = async () => {
      const rows = user ? await pendingItems(user.id) : [],
        count = user ? await deviceDraftCount(user.id) : 0;
      if (active) {
        setItems(rows);
        setDraftCount(count);
        setStorageError(getStorageError());
      }
    };
    const sync = () => {
      if (user && isOnline()) void syncPending(user.id);
      void update();
    };
    const report = async () => {
      if (!user || !isOnline()) return;
      try {
        let deviceId = localStorage.getItem("dakshsetu-device-id");
        if (!deviceId) {
          deviceId = crypto.randomUUID();
          localStorage.setItem("dakshsetu-device-id", deviceId);
        }
        const pending = await pendingItems(user.id);
        const drafts = await deviceDraftCount(user.id);
        if (!active || activeOwner() !== user.id) return;
        const result = await api.post("/sync/telemetry", {
          deviceId,
          pending: pending.length,
          failed: pending.filter((i) => i.status === "failed").length,
          conflicts: pending.filter((i) => i.status === "conflict").length,
          drafts,
        });
        if (!active || activeOwner() !== user.id) return;
        const key = "dakshsetu-retry:" + user.id;
        if (
          result.data.retryRequestedAt &&
          sessionStorage.getItem(key) !== result.data.retryRequestedAt
        ) {
          sessionStorage.setItem(key, result.data.retryRequestedAt);
          await retryPending(user.id);
        }
      } catch {
        /* Telemetry must never block the owner's offline workflow. */
      }
    };
    void sync();
    void report();
    const reportTimer = window.setInterval(() => void report(), 30000);
    window.addEventListener("online", sync);
    window.addEventListener("dakshsetu:offline-change", update);
    const timer = window.setInterval(sync, 15000);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.clearInterval(reportTimer);
      window.removeEventListener("online", sync);
      window.removeEventListener("dakshsetu:offline-change", update);
    };
  }, [user?.id]);
  const conflicts = items.filter(
      (i) => i.status === "conflict" || i.status === "failed",
    ),
    syncing = items.some((i) => i.status === "syncing");
  return (
    <div
      className={`connectivity ${online ? "online" : "offline"} ${online && !items.length && !draftCount && !storageError && !error ? "is-quiet" : ""}`}
      role="status"
      aria-live="polite"
    >
      <div className="container">
        <span>
          {online ? <Wifi size={16} /> : <WifiOff size={16} />}
          <strong>{tr(online ? "Online" : "You're offline.")}</strong>
        </span>
        {!online && (
          <span>
            {tr(
              "Previously opened pages and saved drafts are available on this device.",
            )}
          </span>
        )}
        {syncing ? (
          <span>
            <RefreshCw size={15} />
            {tr("Syncing…")}
          </span>
        ) : items.length ? (
          <span>
            {items.length} {tr("changes waiting")}
          </span>
        ) : (
          user && (
            <span>
              <CheckCircle2 size={15} />
              {tr(
                draftCount ? "Device draft saved." : "Everything is up to date",
              )}
            </span>
          )
        )}
        {user && items.length > 0 && online && (
          <button
            className="text-button"
            onClick={() => void retryPending(user.id)}
          >
            {tr("Retry sync")}
          </button>
        )}
        {user && items.length === 0 && offlineDatabase() && (
          <details>
            <summary>{tr("Device storage")}</summary>
            <button
              className="text-button"
              onClick={() => {
                if (
                  !draftCount ||
                  window.confirm(
                    tr(
                      "Clear saved device data, including unfinished drafts? This cannot be undone.",
                    ),
                  )
                )
                  void clearDeviceData(user.id).catch((e) =>
                    setError(e.message),
                  );
              }}
            >
              {tr("Clear saved device data")}
            </button>
          </details>
        )}
        {conflicts.map((item) => (
          <span key={item.id}>
            <Link to={item.href}>
              <AlertTriangle size={16} />
              {tr("Review a device draft")}
            </Link>
            <button
              className="text-button"
              onClick={() => {
                if (
                  window.confirm(
                    tr(
                      "Discard this unsynced device update? This cannot be undone.",
                    ),
                  )
                )
                  void discardResource(item.ownerId, item.resourceId).catch(
                    (e) => setError(e.message),
                  );
              }}
            >
              {tr("Discard device update")}
            </button>
          </span>
        ))}
        {(storageError || error) && (
          <strong className="storage-error">{tr(storageError || error)}</strong>
        )}
      </div>
    </div>
  );
}
