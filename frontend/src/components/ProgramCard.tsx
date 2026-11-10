import { Badge, Button, Icon } from './ui';

export default function ProgramCard({ name, description, days, onOpen }: {
  name: string; description?: string | null; days?: { id: string; number: number }[]; onOpen: () => void;
}) {
  return <article className="program-card panel"><div className="split"><Badge>{days ? `${days.length}-day split` : 'Your program'}</Badge><Icon name="workout"/></div><h3>{name}</h3>{description && <p>{description}</p>}{days && <div className="program-tags">{days.map(day => <span key={day.id}>Day {day.number}</span>)}</div>}<Button onClick={onOpen} aria-label={`View program: ${name}`}>View program<Icon name="arrow" size={17}/></Button></article>;
}
