import PageHead from '../components/PageHead';
import Icon from '../components/Icon';

export default function Placeholder({ title, icon = 'settings', note }) {
  return (
    <>
      <PageHead title={title} sub="Part of the platform command center" />
      <div className="card card-pad" style={{ textAlign: 'center', padding: 60 }}>
        <div className="k-ico" style={{ margin: '0 auto 14px', width: 56, height: 56, background: 'var(--brand-soft)', color: 'var(--brand)' }}>
          <Icon name={icon} size={26} />
        </div>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{title}</div>
        <div className="muted" style={{ maxWidth: 460, margin: '8px auto 0', fontSize: 14 }}>
          {note || 'This section is scaffolded and wired into navigation. The full feature set ships in the next phase of the command-center rollout.'}
        </div>
      </div>
    </>
  );
}
