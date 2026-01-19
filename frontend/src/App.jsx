import React, { useEffect, useMemo, useState } from "react";

const PLACES = ["板継", "1A1", "1A2", "1A3", "先付", "2A1", "2A2", "2A3", "依頼工事", "連絡事項"];
const TIMES = ["IA・VL","7:00","8:00","9:00","10:00","11:00","12:00","13:00","14:00","15:00","16:00","17:00","18:00","19:00"];

function ymd(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function uid() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function loadDb() {
  try {
    const raw = localStorage.getItem("haizai_db");
    if (!raw) return { requests: [] };
    const db = JSON.parse(raw);

    // 旧データ互換（startHour などがあれば time に寄せる）
    const requests = (db.requests || []).map((r) => {
      let date = r.date || r.targetDate || ymd();
      if (typeof date === "string" && date.includes("/")) {
        date = date.replaceAll("/", "-");
      }
      let time = r.time;
      if (!time && typeof r.startHour === "number") time = `${r.startHour}:00`;
      if (!time) time = "7:00";

      return {
        id: r.id || uid(),
        date,
        place: r.place || "1A1",
        time,
        hopeDate: r.hopeDate || r.deliveryDate || "", // 希望搬入日
        title: r.title || r.ship || r.item || "未入力",
        memo: r.memo || r.note || "",
      };
    });

    return { requests };
  } catch {
    return { requests: [] };
  }
}

function saveDb(db) {
  localStorage.setItem("haizai_db", JSON.stringify(db));
}

function BottomSheet({ open, onClose, children }) {
  if (!open) return null;
  return (
    <>
      <div className="sheetBackdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true">
        <div className="sheetInner">
          <div className="handle" />
          {children}
        </div>
      </div>
    </>
  );
}

export default function App() {
  const [db, setDb] = useState(() => loadDb());
  const [tab, setTab] = useState("schedule"); // schedule | list
  const [date, setDate] = useState(ymd());
  const [sheetOpen, setSheetOpen] = useState(false);

  // 入力フォーム状態（スマホ向け：選ぶだけ中心）
  const [place, setPlace] = useState(PLACES[1]);
  const [time, setTime] = useState(TIMES[1]);
  const [hopeDate, setHopeDate] = useState("");
  const [title, setTitle] = useState("");
  const [memo, setMemo] = useState("");

  useEffect(() => {
    saveDb(db);
  }, [db]);

  const requestsForDay = useMemo(() => {
    return db.requests
      .filter((r) => r.date === date)
      .sort((a, b) => (PLACES.indexOf(a.place) - PLACES.indexOf(b.place)) || (TIMES.indexOf(a.time) - TIMES.indexOf(b.time)));
  }, [db, date]);

  // 縦スクロール用：場所→時間→カード（同じ場所/同じ時間は重ねず「積む」）
  const grouped = useMemo(() => {
    const map = new Map(); // place -> time -> items[]
    for (const p of PLACES) map.set(p, new Map(TIMES.map((t) => [t, []])));
    for (const r of requestsForDay) {
      if (!map.has(r.place)) map.set(r.place, new Map(TIMES.map((t) => [t, []])));
      const tmap = map.get(r.place);
      if (!tmap.has(r.time)) tmap.set(r.time, []);
      tmap.get(r.time).push(r);
    }
    return map;
  }, [requestsForDay]);

  function openNew() {
    setPlace(PLACES[1]);
    setTime(TIMES[1]);
    setHopeDate("");
    setTitle("");
    setMemo("");
    setSheetOpen(true);
  }

  function addRequest() {
    if (!title.trim()) return;
    const item = { id: uid(), date, place, time, hopeDate, title: title.trim(), memo: memo.trim() };
    setDb((prev) => ({ ...prev, requests: [item, ...prev.requests] }));
    setSheetOpen(false);
  }

  function removeRequest(id) {
    setDb((prev) => ({ ...prev, requests: prev.requests.filter((r) => r.id !== id) }));
  }

  return (
    <>
      <div className="header">
        <div className="headerInner">
          <div style={{ flex: 1 }}>
            <div className="title">配材アプリ</div>
            <div className="subtitle">スマホ特化（縦スクロール）</div>
          </div>
          <span className="pill">対象日</span>
          <input
            className="input"
            style={{ width: 160 }}
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <div className="container">
        {tab === "schedule" ? (
          <>
            {PLACES.map((p) => {
              const tmap = grouped.get(p);
              if (!tmap) return null;

              // 当日その場所に1件もない場合は畳む（見やすさ優先）
              const hasAny = TIMES.some((t) => (tmap.get(t) || []).length > 0);
              if (!hasAny) return null;

              return (
                <div className="scheduleGroup" key={p}>
                  <div className="groupHeader">
                    <div className="groupName">{p}</div>
                    <div className="small">
                      {TIMES.reduce((n, t) => n + (tmap.get(t)?.length || 0), 0)}件
                    </div>
                  </div>

                  <div className="card">
                    {TIMES.map((t) => {
                      const items = tmap.get(t) || [];
                      if (items.length === 0) return null;

                      return (
                        <div className="timeRow" key={t}>
                          <div className="timeLabel">{t}</div>
                          <div className="itemStack">
                            {items.map((it) => (
                              <div className="item" key={it.id}>
                                <div className="rowBetween">
                                  <div className="itemTitle">{it.title}</div>
                                  <button className="btn btnGhost" onClick={() => removeRequest(it.id)}>
                                    削除
                                  </button>
                                </div>
                                <div className="itemMeta">
                                  {it.hopeDate ? <span>希望搬入日：{it.hopeDate}</span> : <span>希望搬入日：-</span>}
                                  {it.memo ? <span>メモ：{it.memo}</span> : null}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {/* その場所にあるけど表示できる時間がない場合は何も出ないのでOK */}
                  </div>
                </div>
              );
            })}

            {requestsForDay.length === 0 && (
              <div className="card cardPad" style={{ marginTop: 12 }}>
                <div className="sectionTitle">まだ依頼がありません</div>
                <div className="small">右下の＋から追加できます。</div>
              </div>
            )}
          </>
        ) : (
          <div className="card cardPad">
            <div className="rowBetween">
              <div>
                <div className="sectionTitle">一覧（当日）</div>
                <div className="small">登録データを縦に確認できます</div>
              </div>
              <span className="pill">{requestsForDay.length}件</span>
            </div>

            <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
              {requestsForDay.map((it) => (
                <div className="item" key={it.id}>
                  <div className="rowBetween">
                    <div className="itemTitle">{it.title}</div>
                    <button className="btn btnGhost" onClick={() => removeRequest(it.id)}>
                      削除
                    </button>
                  </div>
                  <div className="itemMeta">
                    <span>場所：{it.place}</span>
                    <span>搬入時間：{it.time}</span>
                    <span>希望搬入日：{it.hopeDate || "-"}</span>
                  </div>
                  {it.memo ? <div className="small" style={{ marginTop: 6 }}>{it.memo}</div> : null}
                </div>
              ))}
              {requestsForDay.length === 0 ? <div className="small">データなし</div> : null}
            </div>
          </div>
        )}
      </div>

      <button className="fab" onClick={openNew} aria-label="追加">＋</button>

      <div className="bottomBar">
        <div className="bottomBarInner">
          <button className={`btn ${tab === "schedule" ? "btnPrimary" : "btnGhost"}`} onClick={() => setTab("schedule")}>
            スケジュール
          </button>
          <button className={`btn ${tab === "list" ? "btnPrimary" : "btnGhost"}`} onClick={() => setTab("list")}>
            一覧
          </button>
        </div>
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <div className="sectionTitle">依頼を追加</div>
        <div className="small">スマホで入力しやすいように「選ぶだけ」中心にしています。</div>

        <div style={{ height: 10 }} />

        <div className="card cardPad" style={{ display: "grid", gap: 10 }}>
          <div>
            <div className="small">場所（固定）</div>
            <select className="select" value={place} onChange={(e) => setPlace(e.target.value)}>
              {PLACES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <div className="small">搬入時間（固定）</div>
            <select className="select" value={time} onChange={(e) => setTime(e.target.value)}>
              {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <div className="small">希望搬入日（追加）</div>
            <input className="input" type="date" value={hopeDate} onChange={(e) => setHopeDate(e.target.value)} />
          </div>

          <div>
            <div className="small">依頼内容（短く）</div>
            <input className="input" placeholder="例：レーン1 配材" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>

          <div>
            <div className="small">メモ（任意）</div>
            <textarea className="textarea" placeholder="補足があれば" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </div>

          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn btnGhost" style={{ flex: 1 }} onClick={() => setSheetOpen(false)}>
              閉じる
            </button>
            <button className="btn btnPrimary" style={{ flex: 1 }} onClick={addRequest}>
              追加
            </button>
          </div>
        </div>

        <div style={{ height: 10 }} />
        <div className="small">
          ※ 次の段階で「2時間固定→指で伸ばす（1h/3h）」の編集UIも入れます（今は1時間枠表示を安定させるのを優先）。
        </div>
      </BottomSheet>
    </>
  );
}
