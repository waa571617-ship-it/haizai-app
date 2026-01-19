import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * スマホ特化：配材アプリ（ログインなし・ローカル保存）
 * - 入力項目：希望搬入日 / 場所 / 搬入時間 / ブロック / 番船 / 備考
 * - 枠時間入力は無し：新規は2h固定
 * - スケジュール上で指ドラッグで枠(1h〜19:00まで)を伸縮
 * - 同じ場所×同じ時間の重なりはレーンで分離して重ならない
 * - ボトムシートで追加/編集
 * - スケジュールは縦スクロール最適化（場所ごとセクション + 時間ヘッダ横スクロール）
 */

// ===== 固定マスタ =====
const PLACES = ["板継", "1A1", "1A2", "1A3", "先付", "2A1", "2A2", "2A3", "依頼工事", "連絡事項"];

const START_HOUR = 7;
const END_HOUR = 19;
const HOURS = Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, i) => START_HOUR + i);
const SLOTS = ["IA・VL", ...HOURS];

const DB_KEY = "haizai_db_v4";
const DEFAULT_DURATION = 2; // 新規は2h固定

function ymd(d) {
  const dt = d instanceof Date ? d : new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
function loadDb() {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return { requests: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.requests)) return { requests: [] };
    const fixed = parsed.requests.map((r) => ({
      ...r,
      duration: typeof r.duration === "number" ? r.duration : DEFAULT_DURATION,
    }));
    return { requests: fixed };
  } catch {
    return { requests: [] };
  }
}
function saveDb(db) {
  localStorage.setItem(DB_KEY, JSON.stringify(db));
}

function slotOrder(slot) {
  if (slot === "IA・VL") return -1;
  return Number(slot);
}
function slotLabel(slot) {
  if (slot === "IA・VL") return "IA・VL";
  return `${String(slot).padStart(2, "0")}:00`;
}
function clampDuration(slot, duration) {
  // IA・VL は 1h固定
  if (slot === "IA・VL") return 1;

  const start = Number(slot);
  const maxD = END_HOUR - start + 1; // 19:00開始なら最大1
  const d = Math.max(1, Math.min(maxD, Number(duration) || DEFAULT_DURATION));
  return d;
}
function overlaps(a, b) {
  if (a.slot === "IA・VL" || b.slot === "IA・VL") return a.slot === b.slot;
  const aS = Number(a.slot);
  const bS = Number(b.slot);
  const aE = aS + Number(a.duration);
  const bE = bS + Number(b.duration);
  return aS < bE && bS < aE;
}
function buildLanes(items) {
  const sorted = [...items].sort((x, y) => slotOrder(x.slot) - slotOrder(y.slot));
  const lanes = [];
  for (const item of sorted) {
    let placed = false;
    for (const lane of lanes) {
      const conflict = lane.some((it) => overlaps(it, item));
      if (!conflict) {
        lane.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) lanes.push([item]);
  }
  return lanes;
}

// ===== UI styles =====
const styles = {
  app: {
    fontFamily: `"Segoe UI", system-ui, -apple-system, sans-serif`,
    background: "#f6f7fb",
    minHeight: "100vh",
    paddingBottom: 86,
  },
  container: { maxWidth: 1100, margin: "0 auto", padding: 12 },
  card: {
    background: "white",
    borderRadius: 18,
    boxShadow: "0 8px 20px rgba(0,0,0,0.07)",
    padding: 14,
  },
  h1: { fontSize: 20, margin: 0, fontWeight: 900 },
  sub: { marginTop: 6, color: "#667", fontSize: 12, lineHeight: 1.45 },

  input: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 14,
    border: "1px solid #dde2ee",
    outline: "none",
    fontSize: 14,
    background: "white",
  },
  btnGhost: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #dde2ee",
    background: "white",
    fontWeight: 1000,
    fontSize: 14,
  },

  tabBar: {
    position: "fixed",
    left: 0,
    right: 0,
    bottom: 0,
    background: "white",
    borderTop: "1px solid #e8ecf6",
    padding: 10,
  },
  tabInner: { maxWidth: 1100, margin: "0 auto", display: "flex", gap: 10 },
  tabBtn: (active) => ({
    flex: 1,
    padding: "11px 12px",
    borderRadius: 14,
    border: active ? "1px solid #3b82f6" : "1px solid #dde2ee",
    background: active ? "rgba(59,130,246,0.12)" : "white",
    fontWeight: 1000,
    fontSize: 14,
  }),
  fab: {
    position: "fixed",
    right: 14,
    bottom: 98,
    width: 56,
    height: 56,
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(135deg, #3b82f6, #a855f7)",
    color: "white",
    fontSize: 28,
    fontWeight: 900,
    boxShadow: "0 14px 26px rgba(59,130,246,0.28)",
  },

  sheetOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.32)",
    display: "flex",
    justifyContent: "center",
    alignItems: "flex-end",
    padding: 10,
    zIndex: 50,
  },
  sheet: {
    width: "min(720px, 100%)",
    background: "white",
    borderRadius: 22,
    boxShadow: "0 20px 40px rgba(0,0,0,0.2)",
    padding: 14,
    maxHeight: "86vh",
    overflow: "auto",
  },
  sheetHandle: {
    width: 46,
    height: 5,
    borderRadius: 999,
    background: "#e8ecf6",
    margin: "2px auto 10px",
  },
  btnPrimary: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "none",
    background: "#3b82f6",
    color: "white",
    fontWeight: 1000,
    fontSize: 15,
  },
  btnDanger: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid rgba(239,68,68,0.25)",
    background: "rgba(255,245,245,0.92)",
    color: "#b91c1c",
    fontWeight: 1000,
    fontSize: 15,
  },
};

function Label({ children }) {
  return <div style={{ fontSize: 12, color: "#556", fontWeight: 1000, marginBottom: 6 }}>{children}</div>;
}

export default function App() {
  const [db, setDb] = useState(() => loadDb());
  const [tab, setTab] = useState("schedule"); // schedule | list
  const [viewDate, setViewDate] = useState(() => ymd(new Date()));
  const [placeFilter, setPlaceFilter] = useState("ALL"); // ALL or place

  // ボトムシート
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(() => ({
    date: ymd(new Date()),
    place: PLACES[0],
    slot: 7,
    block: "",
    ship: "",
    note: "",
  }));

  useEffect(() => saveDb(db), [db]);

  const requestsForDay = useMemo(() => {
    return db.requests
      .filter((r) => r.date === viewDate)
      .sort((a, b) => {
        const p = a.place.localeCompare(b.place);
        if (p !== 0) return p;
        return slotOrder(a.slot) - slotOrder(b.slot);
      });
  }, [db, viewDate]);

  // place => lanes
  const scheduleLanesByPlace = useMemo(() => {
    const map = new Map();
    for (const p of PLACES) {
      const items = requestsForDay.filter((r) => r.place === p);
      map.set(p, buildLanes(items));
    }
    return map;
  }, [requestsForDay]);

  function openNewSheet() {
    setEditingId(null);
    setForm({
      date: viewDate,
      place: placeFilter === "ALL" ? PLACES[0] : placeFilter,
      slot: 7,
      block: "",
      ship: "",
      note: "",
    });
    setSheetOpen(true);
  }
  function openEditSheet(item) {
    setEditingId(item.id);
    setForm({
      date: item.date,
      place: item.place,
      slot: item.slot,
      block: item.block || "",
      ship: item.ship || "",
      note: item.note || "",
    });
    setSheetOpen(true);
  }

  function upsertRequest() {
    const cleanDate = form.date || viewDate;
    const cleanPlace = form.place;
    const cleanSlot = form.slot;

    if (!cleanDate || !cleanPlace || !cleanSlot) return;

    if (editingId) {
      setDb((prev) => ({
        ...prev,
        requests: prev.requests.map((r) => {
          if (r.id !== editingId) return r;
          const next = {
            ...r,
            date: cleanDate,
            place: cleanPlace,
            slot: cleanSlot,
            block: String(form.block || "").trim(),
            ship: String(form.ship || "").trim(),
            note: String(form.note || "").trim(),
          };
          next.duration = clampDuration(next.slot, next.duration);
          return next;
        }),
      }));
    } else {
      const item = {
        id: uid(),
        date: cleanDate,
        place: cleanPlace,
        slot: cleanSlot,
        duration: clampDuration(cleanSlot, DEFAULT_DURATION), // 新規2h
        block: String(form.block || "").trim(),
        ship: String(form.ship || "").trim(),
        note: String(form.note || "").trim(),
        createdAt: Date.now(),
      };
      setDb((prev) => ({ ...prev, requests: [item, ...prev.requests] }));
    }

    setSheetOpen(false);
    setEditingId(null);
  }

  function deleteRequest(id) {
    if (!confirm("この依頼を削除しますか？")) return;
    setDb((prev) => ({ ...prev, requests: prev.requests.filter((r) => r.id !== id) }));
    setSheetOpen(false);
    setEditingId(null);
  }

  // ===== 伸縮ドラッグ =====
  const COL_W = 98; // 1時間分の幅（ドラッグ換算に使う）
  const dragStateRef = useRef(null);

  function updateDuration(id, newDuration) {
    setDb((prev) => ({
      ...prev,
      requests: prev.requests.map((r) => {
        if (r.id !== id) return r;
        return { ...r, duration: clampDuration(r.slot, newDuration) };
      }),
    }));
  }

  function startResize(e, item) {
    e.preventDefault();
    e.stopPropagation();
    if (item.slot === "IA・VL") return;

    const startX = e.clientX ?? (e.touches?.[0]?.clientX ?? 0);
    dragStateRef.current = {
      id: item.id,
      startX,
      startDuration: item.duration,
      slot: item.slot,
    };

    window.addEventListener("pointermove", onResizeMove);
    window.addEventListener("pointerup", endResize, { once: true });
  }

  function onResizeMove(ev) {
    const st = dragStateRef.current;
    if (!st) return;

    const x = ev.clientX ?? 0;
    const deltaPx = x - st.startX;
    const deltaCols = Math.round(deltaPx / COL_W);
    updateDuration(st.id, st.startDuration + deltaCols);
  }

  function endResize() {
    dragStateRef.current = null;
    window.removeEventListener("pointermove", onResizeMove);
  }

  // ===== 画面：スケジュール（縦最適化） =====
  const placesToShow = placeFilter === "ALL" ? PLACES : [placeFilter];

  const ScheduleView = (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h1 style={styles.h1}>スケジュール</h1>
        <div style={{ fontSize: 12, color: "#667", fontWeight: 1000 }}>{requestsForDay.length}件</div>
      </div>
      <div style={styles.sub}>
        新規は<b>2時間</b>で登録。カード右下<b>⇔</b>を指でドラッグして、<b>19:00まで</b>伸び縮みできます（IA・VLは1h固定）。
        <br />
        被りはレーンで分離して重ならない表示です。
      </div>

      <div style={{ height: 12 }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} style={{ ...styles.input, maxWidth: 220 }} />
        <select value={placeFilter} onChange={(e) => setPlaceFilter(e.target.value)} style={{ ...styles.input, maxWidth: 220 }}>
          <option value="ALL">場所：全て</option>
          {PLACES.map((p) => (
            <option key={p} value={p}>
              場所：{p}
            </option>
          ))}
        </select>
        <button style={{ ...styles.btnGhost, maxWidth: 180 }} onClick={openNewSheet}>
          ＋ 依頼を追加
        </button>
      </div>

      <div style={{ height: 12 }} />

      {/* 時間ヘッダは横スクロール（A案） */}
      <div style={{ borderRadius: 16, border: "1px solid #e8ecf6", overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          {/* stickyな時間ヘッダ */}
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 5,
              background: "#fff",
              borderBottom: "1px solid #e8ecf6",
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: `160px repeat(${SLOTS.length}, ${COL_W}px)` }}>
              <div style={timeHeaderCell({ stickyLeft: true })}>場所</div>
              {SLOTS.map((s) => (
                <div key={String(s)} style={timeHeaderCell({})}>
                  {slotLabel(s)}
                </div>
              ))}
            </div>
          </div>

          {/* 場所ごとセクション（縦スクロールがメイン） */}
          <div>
            {placesToShow.map((place) => {
              const lanes = scheduleLanesByPlace.get(place) || [];
              const laneCount = Math.max(1, lanes.length);

              return (
                <div key={place} style={{ borderBottom: "1px solid #eef2fb" }}>
                  {/* 場所見出し */}
                  <div
                    style={{
                      position: "sticky",
                      top: 44, // 時間ヘッダの下
                      zIndex: 4,
                      background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(168,85,247,0.06))",
                      borderBottom: "1px solid #eef2fb",
                    }}
                  >
                    <div style={{ padding: "10px 12px", fontWeight: 1000, display: "flex", justifyContent: "space-between" }}>
                      <div>{place}</div>
                      <div style={{ fontSize: 12, color: "#667" }}>{lanes.length ? `レーン ${lanes.length}` : "レーン 1"}</div>
                    </div>
                  </div>

                  {/* レーン行 */}
                  {Array.from({ length: laneCount }, (_, laneIdx) => {
                    const laneItems = lanes[laneIdx] || [];
                    const startMap = new Map(laneItems.map((it) => [String(it.slot), it]));

                    const rowCells = [];
                    let i = 0;
                    while (i < SLOTS.length) {
                      const slotKey = String(SLOTS[i]);
                      const it = startMap.get(slotKey);

                      if (it) {
                        const span = it.slot === "IA・VL" ? 1 : clampDuration(it.slot, it.duration);
                        const safeSpan = Math.min(span, SLOTS.length - i);

                        rowCells.push(
                          <div
                            key={`${place}-${laneIdx}-${slotKey}`}
                            style={{
                              gridColumn: `span ${safeSpan}`,
                              padding: 6,
                              borderRight: "1px solid #eef2fb",
                              borderBottom: "1px solid #eef2fb",
                              minHeight: 72,
                              background: "#fff",
                            }}
                          >
                            <ScheduleCard item={it} onTap={() => openEditSheet(it)} onResizeStart={(e) => startResize(e, it)} />
                          </div>
                        );
                        i += safeSpan;
                      } else {
                        rowCells.push(
                          <div
                            key={`${place}-${laneIdx}-${slotKey}-empty`}
                            style={{
                              borderRight: "1px solid #eef2fb",
                              borderBottom: "1px solid #eef2fb",
                              minHeight: 72,
                              background: "#fff",
                            }}
                          />
                        );
                        i += 1;
                      }
                    }

                    return (
                      <div key={`${place}-lane-${laneIdx}`} style={{ display: "grid", gridTemplateColumns: `160px repeat(${SLOTS.length}, ${COL_W}px)` }}>
                        {/* 左の固定列：場所は見出しにあるので、レーン番号だけ */}
                        <div style={leftLaneCell()}>
                          {laneIdx === 0 ? "レーン1" : `レーン${laneIdx + 1}`}
                        </div>
                        {rowCells}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ height: 10 }} />
      <div style={{ fontSize: 12, color: "#667" }}>
        使い方：カードをタップ→編集（ボトムシート）。カード右下⇔をドラッグ→枠時間変更（19:00まで）。
      </div>
    </div>
  );

  // ===== 画面：一覧 =====
  const ListView = (
    <div style={styles.card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <h1 style={styles.h1}>依頼一覧</h1>
        <div style={{ fontSize: 12, color: "#667", fontWeight: 1000 }}>{requestsForDay.length}件</div>
      </div>
      <div style={styles.sub}>カードをタップで編集できます。</div>

      <div style={{ height: 12 }} />
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input type="date" value={viewDate} onChange={(e) => setViewDate(e.target.value)} style={{ ...styles.input, maxWidth: 220 }} />
        <button style={{ ...styles.btnGhost, maxWidth: 180 }} onClick={openNewSheet}>
          ＋ 依頼を追加
        </button>
      </div>

      <div style={{ height: 12 }} />
      {requestsForDay.length === 0 ? (
        <div style={{ color: "#667", fontSize: 14 }}>この日の依頼はありません。＋で追加してください。</div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {requestsForDay.map((r) => (
            <div
              key={r.id}
              onClick={() => openEditSheet(r)}
              style={{
                borderRadius: 16,
                border: "1px solid #e8ecf6",
                padding: 12,
                background: "linear-gradient(135deg, rgba(59,130,246,0.08), rgba(168,85,247,0.06))",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
                <div style={{ fontWeight: 1000, fontSize: 14 }}>
                  {r.place} / {slotLabel(r.slot)}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 1000,
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(34,197,94,0.12)",
                    border: "1px solid rgba(34,197,94,0.25)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {r.duration}h
                </div>
              </div>

              <div style={{ height: 6 }} />
              <div style={{ fontSize: 13 }}>
                <b>{r.block || "（ブロック未入力）"}</b>
                {r.ship ? `（${r.ship}）` : ""}
              </div>
              {r.note ? <div style={{ fontSize: 12, color: "#556", marginTop: 6 }}>{r.note}</div> : null}
              <div style={{ height: 8 }} />
              <div style={{ fontSize: 12, color: "#667" }}>タップで編集</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div style={styles.app}>
      <div style={styles.container}>{tab === "schedule" ? ScheduleView : ListView}</div>

      <button style={styles.fab} onClick={openNewSheet} aria-label="add">
        ＋
      </button>

      <div style={styles.tabBar}>
        <div style={styles.tabInner}>
          <button style={styles.tabBtn(tab === "schedule")} onClick={() => setTab("schedule")}>
            スケジュール
          </button>
          <button style={styles.tabBtn(tab === "list")} onClick={() => setTab("list")}>
            一覧
          </button>
        </div>
      </div>

      {sheetOpen ? (
        <BottomSheet
          title={editingId ? "依頼を編集" : "依頼を追加"}
          form={form}
          setForm={setForm}
          onClose={() => {
            setSheetOpen(false);
            setEditingId(null);
          }}
          onSave={upsertRequest}
          onDelete={editingId ? () => deleteRequest(editingId) : null}
        />
      ) : null}
    </div>
  );
}

// ===== 表のセル見た目 =====
function timeHeaderCell({ stickyLeft = false }) {
  return {
    position: stickyLeft ? "sticky" : "static",
    left: stickyLeft ? 0 : undefined,
    zIndex: stickyLeft ? 6 : 5,
    background: "#f3f5fb",
    borderRight: "1px solid #e8ecf6",
    padding: "10px 10px",
    fontWeight: 1000,
    fontSize: 12,
    whiteSpace: "nowrap",
    textAlign: "left",
  };
}
function leftLaneCell() {
  return {
    position: "sticky",
    left: 0,
    zIndex: 3,
    background: "#fff",
    borderRight: "1px solid #eef2fb",
    borderBottom: "1px solid #eef2fb",
    padding: "10px 10px",
    fontSize: 12,
    color: "#667",
    fontWeight: 1000,
    whiteSpace: "nowrap",
  };
}

// ===== スケジュールカード（ドラッグつまみ付き） =====
function ScheduleCard({ item, onTap, onResizeStart }) {
  const title = `${item.block || "（未入力）"}${item.ship ? `（${item.ship}）` : ""}`;

  return (
    <div
      onClick={onTap}
      style={{
        borderRadius: 14,
        padding: "10px 10px",
        background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(168,85,247,0.10))",
        border: "1px solid rgba(59,130,246,0.25)",
        height: "100%",
        minHeight: 56,
        display: "flex",
        flexDirection: "column",
        gap: 6,
        position: "relative",
        userSelect: "none",
        WebkitUserSelect: "none",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
        <div style={{ fontWeight: 1000, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {title}
        </div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 1000,
            padding: "6px 10px",
            borderRadius: 999,
            background: "rgba(34,197,94,0.14)",
            border: "1px solid rgba(34,197,94,0.28)",
            whiteSpace: "nowrap",
          }}
        >
          {item.duration}h
        </div>
      </div>

      {item.note ? (
        <div style={{ fontSize: 11, color: "#334", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {item.note}
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#667" }}>タップで編集</div>
      )}

      {item.slot === "IA・VL" ? (
        <div style={{ fontSize: 11, color: "#667", fontWeight: 900, marginTop: "auto" }}>IA・VLは1h固定</div>
      ) : (
        <div
          onPointerDown={onResizeStart}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: "absolute",
            right: 6,
            bottom: 6,
            width: 56,
            height: 34,
            borderRadius: 14,
            border: "1px solid rgba(59,130,246,0.22)",
            background: "rgba(255,255,255,0.82)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontWeight: 1000,
            fontSize: 16,
            touchAction: "none",
          }}
          title="ドラッグで枠を変更"
        >
          ⇔
        </div>
      )}
    </div>
  );
}

// ===== ボトムシート =====
function BottomSheet({ title, form, setForm, onClose, onSave, onDelete }) {
  return (
    <div style={styles.sheetOverlay} onClick={onClose}>
      <div style={styles.sheet} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sheetHandle} />
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ fontSize: 16, fontWeight: 1000 }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "transparent", fontSize: 22, fontWeight: 900 }}>
            ×
          </button>
        </div>

        <div style={{ height: 10 }} />

        <Label>希望搬入日</Label>
        <input type="date" value={form.date} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} style={styles.input} />

        <div style={{ height: 10 }} />

        <Label>場所（固定）</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {PLACES.map((p) => (
            <button
              key={p}
              style={{
                padding: "10px 12px",
                borderRadius: 999,
                border: form.place === p ? "1px solid #3b82f6" : "1px solid #dde2ee",
                background: form.place === p ? "rgba(59,130,246,0.12)" : "white",
                fontWeight: 1000,
                fontSize: 13,
              }}
              onClick={() => setForm((prev) => ({ ...prev, place: p }))}
            >
              {p}
            </button>
          ))}
        </div>

        <div style={{ height: 10 }} />

        <Label>搬入時間</Label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {SLOTS.map((s) => {
            const active = String(form.slot) === String(s);
            return (
              <button
                key={String(s)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 999,
                  border: active ? "1px solid #3b82f6" : "1px solid #dde2ee",
                  background: active ? "rgba(59,130,246,0.12)" : "white",
                  fontWeight: 1000,
                  fontSize: 13,
                }}
                onClick={() => setForm((prev) => ({ ...prev, slot: s === "IA・VL" ? "IA・VL" : Number(s) }))}
              >
                {slotLabel(s)}
              </button>
            );
          })}
        </div>

        <div style={{ height: 10 }} />

        <Label>ブロック</Label>
        <input value={form.block} onChange={(e) => setForm((p) => ({ ...p, block: e.target.value }))} placeholder="例：Aブロック" style={styles.input} />

        <div style={{ height: 10 }} />

        <Label>番船</Label>
        <input value={form.ship} onChange={(e) => setForm((p) => ({ ...p, ship: e.target.value }))} placeholder="例：3便" style={styles.input} />

        <div style={{ height: 10 }} />

        <Label>備考</Label>
        <input value={form.note} onChange={(e) => setForm((p) => ({ ...p, note: e.target.value }))} placeholder="例：注意事項など" style={styles.input} />

        <div style={{ height: 14 }} />
        <button style={styles.btnPrimary} onClick={onSave}>
          保存（新規は2時間）
        </button>

        <div style={{ height: 10 }} />
        {onDelete ? (
          <button style={styles.btnDanger} onClick={onDelete}>
            削除
          </button>
        ) : null}

        <div style={{ height: 10 }} />
        <div style={{ fontSize: 12, color: "#667", lineHeight: 1.45 }}>
          ※枠時間は入力しません。保存後にスケジュールでカード右下⇔をドラッグして調整します（19:00まで）。
        </div>
      </div>
    </div>
  );
}
