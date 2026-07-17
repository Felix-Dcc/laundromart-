import { useEffect, useState } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Loading, Empty, fmtDate } from '../components/ui';
import { sa } from '../api/client';

const Stars = ({ n }) => <span style={{ color: '#f59e0b', letterSpacing: 1 }}>{'★'.repeat(n)}<span style={{ color: 'var(--border)' }}>{'★'.repeat(5 - n)}</span></span>;

export default function Reviews() {
  const [rows, setRows] = useState(null);
  const [min, setMin] = useState(0);

  async function load() { setRows(null); const r = await sa.reviews(); setRows(r.data.reviews); }
  useEffect(() => { load(); }, []);

  async function del(r) {
    if (!window.confirm('Remove this review? The provider rating will be recalculated.')) return;
    try { await sa.deleteReview(r.id); load(); } catch (e) { alert(e.response?.data?.error || 'Failed'); }
  }

  const list = (rows || []).filter((r) => r.rating >= min);
  const avg = rows?.length ? (rows.reduce((s, r) => s + r.rating, 0) / rows.length).toFixed(2) : '—';

  return (
    <>
      <PageHead title="Reviews" sub={`${rows?.length ?? 0} reviews · avg ${avg}★`} />
      <div className="toolbar">
        <select className="input" value={min} onChange={(e) => setMin(Number(e.target.value))}>
          <option value={0}>All ratings</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}★ and up</option>)}
        </select>
        <button className="btn" onClick={load}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="card">
        {rows == null ? <Loading /> : list.length === 0 ? <Empty title="No reviews" sub="Reviews appear once customers rate completed orders." /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Rating</th><th>Provider</th><th>Author</th><th>Comment</th><th>Order</th><th>Date</th><th></th></tr></thead>
              <tbody>
                {list.map((r) => (
                  <tr key={r.id}>
                    <td><Stars n={r.rating} /></td>
                    <td style={{ fontWeight: 600 }}>{r.provider}</td>
                    <td>{r.author}</td>
                    <td className="muted" style={{ maxWidth: 320 }}>{r.comment || <span style={{ fontStyle: 'italic' }}>No comment</span>}</td>
                    <td className="muted">{r.orderNumber || '—'}</td>
                    <td className="muted">{fmtDate(r.createdAt)}</td>
                    <td><button className="icon-btn" title="Remove review" onClick={() => del(r)}><Icon name="trash" size={15} color="var(--danger)" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
