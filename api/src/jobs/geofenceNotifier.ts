import cron from 'node-cron';
import { query } from '../db/client';
import { haversineDistance } from '../services/geofence';

const RADIUS_KM = 5;
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface TechnicianRow {
  id: number;
  push_token: string;
  last_known_lat: string;
  last_known_lng: string;
}

interface OrgRow {
  id: number;
  name: string;
  lat: string;
  lng: string;
  pending_count: string;
}

async function sendExpoPush(
  pushToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<void> {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ to: pushToken, title, body, data, sound: 'default' }),
  });

  if (!response.ok) {
    throw new Error(`Expo push API returned ${response.status}`);
  }
}

async function runGeofenceCheck(): Promise<void> {
  const technicians = await query<TechnicianRow>(
    `SELECT id, push_token, last_known_lat, last_known_lng
     FROM technicians
     WHERE active = true
       AND push_token IS NOT NULL
       AND last_known_lat IS NOT NULL
       AND last_known_lng IS NOT NULL
       AND last_location_at > NOW() - INTERVAL '24 hours'`
  );

  if (technicians.length === 0) return;

  const orgs = await query<OrgRow>(
    `SELECT o.id, o.name,
            AVG(m.last_known_lat)::TEXT AS lat,
            AVG(m.last_known_lng)::TEXT AS lng,
            COUNT(m.id)::TEXT           AS pending_count
     FROM organizations o
     JOIN machines m ON m.org_id = o.id
     WHERE m.last_known_lat IS NOT NULL
       AND m.last_known_lng IS NOT NULL
       AND (m.days_offline >= 30 OR m.last_call_date IS NULL)
       AND m.id NOT IN (
         SELECT machine_id FROM activities
         WHERE status IN ('completed', 'no_use')
           AND machine_id IS NOT NULL
           AND created_at >= NOW() - INTERVAL '24 hours'
       )
     GROUP BY o.id, o.name`
  );

  if (orgs.length === 0) return;

  for (const tech of technicians) {
    const techLat = Number(tech.last_known_lat);
    const techLng = Number(tech.last_known_lng);

    for (const org of orgs) {
      const distance = haversineDistance(techLat, techLng, Number(org.lat), Number(org.lng));
      if (distance > RADIUS_KM) continue;

      // Deduplicate: skip if we already sent this org notification within 2 hours
      const recent = await query(
        `SELECT id FROM notification_log
         WHERE technician_id = $1
           AND org_id = $2
           AND sent_at > NOW() - INTERVAL '2 hours'
         LIMIT 1`,
        [tech.id, org.id]
      );

      if (recent.length > 0) continue;

      const count = parseInt(org.pending_count, 10);
      const distKm = Math.round(distance * 10) / 10;
      const body = `Você está próximo de ${org.name} - ${count} máquina(s) pendente(s) a ${distKm}km`;

      try {
        await sendExpoPush(
          tech.push_token,
          '🚨 Máquinas para coletar!',
          body,
          { org_id: org.id, org_name: org.name, screen: 'MachineList' }
        );

        await query(
          `INSERT INTO notification_log (technician_id, org_id, push_token) VALUES ($1, $2, $3)`,
          [tech.id, org.id, tech.push_token]
        );

        console.log(`[geofenceNotifier] Notified tech ${tech.id} → org "${org.name}" (${distKm}km)`);
      } catch (err) {
        console.error(`[geofenceNotifier] Push failed for tech ${tech.id}, org ${org.id}:`, err);
      }
    }
  }
}

export function startGeofenceNotifier(): void {
  cron.schedule('*/15 * * * *', async () => {
    try {
      await runGeofenceCheck();
    } catch (err) {
      console.error('[geofenceNotifier] Unexpected error:', err);
    }
  });

  console.log('[geofenceNotifier] Scheduled — runs every 15 minutes');
}
