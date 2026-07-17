import { useEffect, useState, useCallback } from 'react';
import PageHead from '../components/PageHead';
import Icon from '../components/Icon';
import { Badge, Loading, Empty, fmtDateTime, exportCsv } from '../components/ui';
import { adminApi } from '../api/client';

const ACTION_COLOR = (a) => a?.includes('DELETED') || a?.includes('CANCELLED') ? '#ef4444'
  : a?.includes('CREATED') || a?.includes('APPROVED') ? '#10b981'
  : a?.includes('REFUND') || a?.includes('PAYMENT') ? '#6366f1' : '#0ea5e9';

export default function AuditLogs() {
  const [rows, setRows] = useState(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [action, setAction] = useState('');

  const load = useCallback(async (p = 1) => {
    setRows(null);
    const r = await adminApi.auditLogs({ page: p, limit: 30, actionType: action || undefined });
    setRows(r.data.logs); setPage(p); setPages(r.data.pagination?.totalPages || 1);
  }, [action]);
  useEffect(() => { load(1); }, [action]); // eslint-disable-line

  const ACTIONS = ['', 'ORDER_CREATED', 'ORDER_STATUS_CHANGED', 'ORDER_CANCELLED', 'USER_CREATED', 'USER_UPDATED', 'USER_DELETED', 'USER_STATUS_CHANGED', 'PAYMENT_PROCESSED', 'REFUND_ISSUED', 'REVIEW_DELETED', 'SETTING_UPDATED'];

  return (
    <>
      <PageHead title="Audit Logs" sub="Every important action, tracked"
        actions={<button className="btn" disabled={!rows} onClick={() => exportCsv('audit-logs.csv', rows.map((l) => ({ action: l.actionType, description: l.description, user: l.user ? `${l.user.firstName} ${l.user.lastName}` : '', ip: l.ipAddress, at: l.createdAt })))}><Icon name="download" size={15} /> Export</button>} />

      <div className="toolbar">
        <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>{ACTIONS.map((a) => <option key={a} value={a}>{a ? a.replace(/_/g, ' ') : 'All actions'}</option>)}</select>
        <button className="btn" onClick={() => load(page)}><Icon name="refresh" size={15} /> Refresh</button>
      </div>

      <div className="card">
        {rows == null ? <Loading /> : rows.length === 0 ? <Empty title="No audit entries" /> : (
          <div className="table-wrap">
            <table className="tbl">
              <thead><tr><th>Action</th><th>Description</th><th>User</th><th>IP Address</th><th>Device</th><th>When</th></tr></thead>
              <tbody>
                {rows.map((l) => (
                  <tr key={l.id}>
                    <td><Badge text={l.actionType.replace(/_/g, ' ')} color={ACTION_COLOR(l.actionType)} /></td>
                    <td style={{ maxWidth: 340 }}>{l.description}</td>
                    <td>{l.user ? `${l.user.firstName} ${l.user.lastName}` : 'System'}<div className="muted" style={{ fontSize: 11 }}>{l.user?.userType}</div></td>
                    <td className="mono muted" style={{ fontSize: 12 }}>{l.ipAddress || '—'}</td>
                    <td className="muted" style={{ fontSize: 11, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.userAgent}>{l.userAgent ? l.userAgent.split(' ')[0] : '—'}</td>
                    <td className="muted">{fmtDateTime(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {rows && pages > 1 && (
          <div className="spread" style={{ padding: 12 }}>
            <span className="muted" style={{ fontSize: 13 }}>Page {page} of {pages}</span>
            <div className="row"><button className="btn sm" disabled={page <= 1} onClick={() => load(page - 1)}><Icon name="chevronL" size={14} /></button><button className="btn sm" disabled={page >= pages} onClick={() => load(page + 1)}><Icon name="chevronR" size={14} /></button></div>
          </div>
        )}
      </div>
    </>
  );
}
